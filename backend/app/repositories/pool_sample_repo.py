"""Repository for pool_samples (Happy / Negative data pool)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fnx_pool_sample import PoolSample


class PoolSampleRepository:
    """CRUD / upsert for transaction data-pool samples."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_fingerprint(self, fingerprint: str) -> PoolSample | None:
        stmt = select(PoolSample).where(PoolSample.source_fingerprint == fingerprint)
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def get_by_id(self, sample_id: int) -> PoolSample | None:
        stmt = select(PoolSample).where(PoolSample.id == sample_id)
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def upsert(self, sample: PoolSample) -> tuple[PoolSample, bool]:
        """Insert or refresh last_seen. Returns (entity, created)."""
        existing = await self.get_by_fingerprint(sample.source_fingerprint)
        if existing is None:
            self._session.add(sample)
            await self._session.flush()
            return sample, True
        existing.last_seen_at = datetime.now(timezone.utc)
        existing.http_status = sample.http_status
        existing.biz_error_code = sample.biz_error_code
        existing.cbb_header_json = sample.cbb_header_json
        existing.request_body_json = sample.request_body_json
        existing.response_body_json = sample.response_body_json
        existing.path_kind = sample.path_kind
        existing.service_code = sample.service_code or existing.service_code
        existing.api_operation_id = sample.api_operation_id or existing.api_operation_id
        if sample.source:
            existing.source = sample.source
        await self._session.flush()
        return existing, False

    async def list(
        self,
        *,
        service_code: str | None = None,
        path_kind: str | None = None,
        source: str | None = None,
        biz_error_code: str | None = None,
        query: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[PoolSample]:
        stmt = select(PoolSample)
        if service_code and service_code.strip():
            stmt = stmt.where(PoolSample.service_code == service_code.strip())
        if path_kind and path_kind.strip():
            stmt = stmt.where(PoolSample.path_kind == path_kind.strip())
        if source and source.strip():
            stmt = stmt.where(PoolSample.source == source.strip())
        if biz_error_code and biz_error_code.strip():
            stmt = stmt.where(PoolSample.biz_error_code == biz_error_code.strip())
        if query and query.strip():
            like = f"%{query.strip()}%"
            stmt = stmt.where(
                (PoolSample.endpoint.ilike(like))
                | (PoolSample.service_code.ilike(like))
                | (PoolSample.biz_error_code.ilike(like))
                | (PoolSample.method.ilike(like))
            )
        stmt = (
            stmt.order_by(PoolSample.last_seen_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def count(
        self,
        *,
        service_code: str | None = None,
        path_kind: str | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(PoolSample)
        if service_code and service_code.strip():
            stmt = stmt.where(PoolSample.service_code == service_code.strip())
        if path_kind and path_kind.strip():
            stmt = stmt.where(PoolSample.path_kind == path_kind.strip())
        return int((await self._session.execute(stmt)).scalar_one())

    async def coverage_by_service(self, *, limit: int = 50) -> list[dict]:
        code_col = func.coalesce(PoolSample.service_code, "(unknown)")
        stmt = (
            select(
                code_col.label("service_code"),
                func.count().label("total"),
                func.sum(
                    case((PoolSample.path_kind == "happy", 1), else_=0),
                ).label("happy"),
                func.sum(
                    case((PoolSample.path_kind == "negative", 1), else_=0),
                ).label("negative"),
            )
            .group_by(code_col)
            .order_by(func.count().desc())
            .limit(limit)
        )
        rows = (await self._session.execute(stmt)).all()
        return [
            {
                "service_code": str(service_code),
                "total": int(total or 0),
                "happy": int(happy or 0),
                "negative": int(negative or 0),
            }
            for service_code, total, happy, negative in rows
        ]

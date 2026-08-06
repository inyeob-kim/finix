"""Repositories for OpenAPI documents and API operations."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fnx_openapi_document import ApiOperation, OpenApiDocument


class OpenApiRepository:
    """Persist OpenAPI documents and normalized operations."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_document_by_checksum(self, checksum: str) -> OpenApiDocument | None:
        stmt = select(OpenApiDocument).where(OpenApiDocument.checksum == checksum)
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def add_document(self, doc: OpenApiDocument) -> OpenApiDocument:
        self._session.add(doc)
        await self._session.flush()
        return doc

    async def list_documents(self, *, limit: int = 50) -> list[OpenApiDocument]:
        stmt = (
            select(OpenApiDocument)
            .order_by(OpenApiDocument.imported_at.desc())
            .limit(limit)
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def upsert_operation(self, op: ApiOperation) -> ApiOperation:
        stmt = select(ApiOperation).where(
            ApiOperation.method == op.method,
            ApiOperation.path == op.path,
        )
        existing = (await self._session.execute(stmt)).scalar_one_or_none()
        if existing is None:
            self._session.add(op)
            await self._session.flush()
            return op
        existing.openapi_document_id = op.openapi_document_id
        existing.service_code = op.service_code or existing.service_code
        existing.operation_id = op.operation_id
        existing.summary = op.summary
        existing.request_schema_json = op.request_schema_json
        existing.response_schema_json = op.response_schema_json
        await self._session.flush()
        return existing

    async def list_operations(
        self,
        *,
        query: str | None = None,
        service_code: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[ApiOperation]:
        stmt = select(ApiOperation)
        if service_code and service_code.strip():
            stmt = stmt.where(ApiOperation.service_code == service_code.strip())
        if query and query.strip():
            like = f"%{query.strip()}%"
            stmt = stmt.where(
                (ApiOperation.path.ilike(like))
                | (ApiOperation.operation_id.ilike(like))
                | (ApiOperation.service_code.ilike(like))
                | (ApiOperation.summary.ilike(like))
            )
        stmt = stmt.order_by(ApiOperation.path.asc()).offset(offset).limit(limit)
        return list((await self._session.execute(stmt)).scalars().all())

    async def count_operations(self) -> int:
        from sqlalchemy import func

        stmt = select(func.count()).select_from(ApiOperation)
        return int((await self._session.execute(stmt)).scalar_one())

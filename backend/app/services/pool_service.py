"""List and inspect Happy / Negative data-pool samples."""

from __future__ import annotations

from typing import Any

from app.core.exceptions import EntityNotFoundError
from app.models.fnx_pool_sample import PoolSample
from app.repositories.pool_sample_repo import PoolSampleRepository
from app.utils.json_text import loads_json


def sample_to_dict(sample: PoolSample) -> dict[str, Any]:
    return {
        "id": sample.id,
        "api_operation_id": sample.api_operation_id,
        "service_code": sample.service_code,
        "method": sample.method,
        "endpoint": sample.endpoint,
        "path_kind": sample.path_kind,
        "http_status": sample.http_status,
        "biz_error_code": sample.biz_error_code,
        "cbb_header": loads_json(sample.cbb_header_json, {}) or None,
        "request_body": loads_json(sample.request_body_json, None),
        "response_body": loads_json(sample.response_body_json, None),
        "source": sample.source,
        "source_fingerprint": sample.source_fingerprint,
        "quality_score": sample.quality_score,
        "created_at": sample.created_at,
        "last_seen_at": sample.last_seen_at,
    }


class PoolService:
    """Query facade for pool_samples."""

    def __init__(self, pool_repo: PoolSampleRepository) -> None:
        self._pool = pool_repo

    async def list_samples(
        self,
        *,
        service_code: str | None = None,
        path_kind: str | None = None,
        source: str | None = None,
        biz_error_code: str | None = None,
        query: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        items = await self._pool.list(
            service_code=service_code,
            path_kind=path_kind,
            source=source,
            biz_error_code=biz_error_code,
            query=query,
            limit=limit,
            offset=offset,
        )
        total = await self._pool.count(service_code=service_code)
        happy_total = await self._pool.count(service_code=service_code, path_kind="happy")
        negative_total = await self._pool.count(
            service_code=service_code,
            path_kind="negative",
        )
        return {
            "items": [sample_to_dict(s) for s in items],
            "total": total,
            "happy_total": happy_total,
            "negative_total": negative_total,
        }

    async def get_sample(self, sample_id: int) -> dict[str, Any]:
        sample = await self._pool.get_by_id(sample_id)
        if sample is None:
            raise EntityNotFoundError("PoolSample", sample_id)
        return sample_to_dict(sample)

    async def coverage_by_service(self, *, limit: int = 50) -> list[dict[str, Any]]:
        return await self._pool.coverage_by_service(limit=limit)

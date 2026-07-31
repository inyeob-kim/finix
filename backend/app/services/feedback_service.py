"""Feed Live execution results back into the data pool."""

from __future__ import annotations

from typing import Any

from app.core.logger import get_logger
from app.domain.bxcm_log.classifiers import biz_error_code_from_body, classify_exchange
from app.domain.bxcm_log.models import ParsedExchange
from app.repositories.pool_sample_repo import PoolSampleRepository
from app.services.log_ingest_service import exchange_to_sample

logger = get_logger(__name__)


class FeedbackService:
    """Upsert Happy/Negative pool samples from successful Live step captures."""

    def __init__(self, pool_repo: PoolSampleRepository) -> None:
        self._pool = pool_repo

    async def ingest_live_step(
        self,
        *,
        method: str,
        endpoint: str,
        service_code: str | None,
        request_body: Any,
        response_body: Any,
        http_status: int | None,
        cbb_header: dict[str, Any] | None = None,
    ) -> int | None:
        """
        Persist one Live step as a pool sample.

        Returns sample id, or None when the step has insufficient data.
        """
        if not endpoint or not method:
            return None
        req = request_body if isinstance(request_body, (dict, list)) else None
        exchange = ParsedExchange(
            method=(method or "POST").upper(),
            endpoint=endpoint if endpoint.startswith("/") else f"/{endpoint}",
            http_status=http_status,
            service_code=(service_code or None),
            cbb_header=cbb_header or {},
            request_body=req,
            response_body=response_body,
            biz_error_code=biz_error_code_from_body(response_body) or None,
        )
        classify_exchange(exchange)
        sample, created = await self._pool.upsert(
            exchange_to_sample(exchange, source="runner_feedback"),
        )
        logger.info(
            "Runner feedback to pool",
            extra={
                "sample_id": sample.id,
                "created": created,
                "path_kind": sample.path_kind,
                "service_code": sample.service_code,
            },
        )
        return sample.id

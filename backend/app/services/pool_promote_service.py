"""Promote data-pool samples into HTTP testcase pool rows."""

from __future__ import annotations

from typing import Any

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.core.logger import get_logger
from app.models.pool_sample import PoolSample
from app.models.testcase import TestCase
from app.repositories.metadata_repo import MetadataRepository
from app.repositories.pool_sample_repo import PoolSampleRepository
from app.repositories.service_registry_repo import ServiceRegistryRepository
from app.utils.json_text import dumps_json, loads_json

logger = get_logger(__name__)


def _display_name(sample: PoolSample) -> str:
    code = (sample.service_code or "SVC").strip() or "SVC"
    if sample.path_kind == "negative":
        err = (sample.biz_error_code or "error").strip() or "error"
        return f"[E] {err} · {code}"
    return f"[N] pool-{sample.id} · {code}"


def _expected_for_sample(sample: PoolSample) -> tuple[int | None, dict[str, Any]]:
    status = sample.http_status
    body = loads_json(sample.response_body_json, {})
    if not isinstance(body, dict):
        body = {}
    if sample.path_kind == "negative":
        code = (sample.biz_error_code or "").strip()
        expected: dict[str, Any] = {"outcome": "error"}
        if code:
            expected["error_code"] = code
            expected["messageId"] = code
        return status if status is not None else 500, expected
    # Happy: keep response fields so Live runner can assert Response Diff
    expected_ok: dict[str, Any] = {"outcome": "success", **body}
    return status if status is not None else 200, expected_ok


class PoolPromoteService:
    """Create scenario-less testcases from pool_samples (SSOT → runnable TC)."""

    def __init__(
        self,
        *,
        pool_repo: PoolSampleRepository,
        metadata_repo: MetadataRepository,
        registry_repo: ServiceRegistryRepository,
    ) -> None:
        self._pool = pool_repo
        self._metadata = metadata_repo
        self._registry = registry_repo

    async def _find_existing_pool_tc(self, sample_id: int) -> TestCase | None:
        return await self._metadata.find_pool_testcase_by_sample_id(sample_id)

    async def promote_sample_with_meta(
        self,
        sample_id: int,
        *,
        replace_existing: bool = False,
    ) -> tuple[TestCase, bool]:
        existing = await self._find_existing_pool_tc(sample_id)
        reused = existing is not None and not replace_existing
        tc = await self.promote_sample(sample_id, replace_existing=replace_existing)
        return tc, reused

    async def promote_sample(
        self,
        sample_id: int,
        *,
        replace_existing: bool = False,
    ) -> TestCase:
        await self._registry.ensure_default_runner_stub()
        sample = await self._pool.get_by_id(sample_id)
        if sample is None:
            raise EntityNotFoundError("PoolSample", sample_id)

        existing = await self._find_existing_pool_tc(sample_id)
        if existing is not None and not replace_existing:
            return existing

        req = loads_json(sample.request_body_json, {})
        if not isinstance(req, dict):
            req = {"_raw": req}
        exp_status, exp_body = _expected_for_sample(sample)
        name = _display_name(sample)

        if existing is not None and replace_existing:
            existing = await self._metadata.update_testcase_http_fields(
                existing,
                name=name,
                http_method=sample.method,
                endpoint=sample.endpoint,
                request_body_json=dumps_json(req),
                expected_status=exp_status,
                expected_body_json=dumps_json(exp_body),
            )
            logger.info(
                "Pool sample TC refreshed",
                extra={"sample_id": sample_id, "testcase_id": existing.id},
            )
            return existing

        tc = await self._metadata.create_testcase(
            name=name,
            steps=None,
            scenario_id=None,
            http_method=sample.method,
            endpoint=sample.endpoint,
            request_body_json=dumps_json(req),
            expected_status=exp_status,
            expected_body_json=dumps_json(exp_body),
            step_index=None,
            rule_bundle_id=None,
            pool_sample_id=sample.id,
        )
        logger.info(
            "Pool sample promoted to testcase",
            extra={"sample_id": sample_id, "testcase_id": tc.id},
        )
        return tc

    async def promote_for_service(
        self,
        service_code: str,
        *,
        path_kind: str | None = None,
        replace_existing: bool = False,
    ) -> list[TestCase]:
        code = (service_code or "").strip()
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        samples = await self._pool.list(
            service_code=code,
            path_kind=path_kind,
            limit=500,
            offset=0,
        )
        if not samples:
            raise InvalidInputError(f"서비스 {code}에 대한 Data Pool 샘플이 없습니다.")
        out: list[TestCase] = []
        for sample in samples:
            out.append(
                await self.promote_sample(
                    sample.id,
                    replace_existing=replace_existing,
                ),
            )
        return out

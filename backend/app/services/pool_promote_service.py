"""Promote data-pool samples into fnx_testcase pool rows."""

from __future__ import annotations

from typing import Any

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.core.logger import get_logger
from app.domain.inst_scope import DEFAULT_INST_CD, require_inst_cd
from app.models.fnx_testcase import FnxTestcase
from app.models.fnx_pool_sample import PoolSample
from app.repositories.fnx_testcase_repo import FnxTestcaseRepository
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


def _pool_rule_case_id(sample: PoolSample) -> str:
    """Natural-key case id for a promoted pool sample (no fnx_rule_case linkage)."""
    return f"POOL-{sample.id}"


class PoolPromoteService:
    """Create scenario-less fnx_testcase rows from pool_samples (SSOT → runnable TC)."""

    def __init__(
        self,
        *,
        pool_repo: PoolSampleRepository,
        tc_repo: FnxTestcaseRepository,
        registry_repo: ServiceRegistryRepository,
    ) -> None:
        self._pool = pool_repo
        self._tc_repo = tc_repo
        self._registry = registry_repo

    async def _find_existing_pool_tc(
        self, sample_id: int, *, inst_cd: str
    ) -> FnxTestcase | None:
        return await self._tc_repo.find_by_pool_sample_id(sample_id, inst_cd=inst_cd)

    async def promote_sample_with_meta(
        self,
        sample_id: int,
        *,
        inst_cd: str = DEFAULT_INST_CD,
        replace_existing: bool = False,
    ) -> tuple[FnxTestcase, bool]:
        inst = require_inst_cd(inst_cd)
        existing = await self._find_existing_pool_tc(sample_id, inst_cd=inst)
        reused = existing is not None and not replace_existing
        tc = await self.promote_sample(
            sample_id, inst_cd=inst, replace_existing=replace_existing
        )
        return tc, reused

    async def promote_sample(
        self,
        sample_id: int,
        *,
        inst_cd: str = DEFAULT_INST_CD,
        replace_existing: bool = False,
    ) -> FnxTestcase:
        await self._registry.ensure_default_runner_stub()
        inst = require_inst_cd(inst_cd)
        sample = await self._pool.get_by_id(sample_id)
        if sample is None:
            raise EntityNotFoundError("PoolSample", sample_id)

        code = (sample.service_code or "").strip()
        if not code:
            raise InvalidInputError("샘플에 service_code가 없습니다.")

        existing = await self._find_existing_pool_tc(sample_id, inst_cd=inst)
        if existing is not None and not replace_existing:
            return existing

        req = loads_json(sample.request_body_json, {})
        if not isinstance(req, dict):
            req = {"_raw": req}
        exp_status, exp_body = _expected_for_sample(sample)
        name = _display_name(sample)

        tc = await self._tc_repo.upsert(
            inst_cd=inst,
            svc_code=code,
            rule_case_id=_pool_rule_case_id(sample),
            name=name,
            http_method=sample.method,
            endpoint=sample.endpoint,
            request_body_json=dumps_json(req),
            expected_status=exp_status,
            expected_body_json=dumps_json(exp_body),
            pool_sample_id=sample.id,
            change_kind="pool_promote",
        )
        logger.info(
            "Pool sample promoted to testcase",
            extra={
                "sample_id": sample_id,
                "svc_code": tc.svc_code,
                "rule_case_id": tc.rule_case_id,
            },
        )
        return tc

    async def promote_for_service(
        self,
        service_code: str,
        *,
        inst_cd: str = DEFAULT_INST_CD,
        path_kind: str | None = None,
        replace_existing: bool = False,
    ) -> list[FnxTestcase]:
        inst = require_inst_cd(inst_cd)
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
        out: list[FnxTestcase] = []
        for sample in samples:
            out.append(
                await self.promote_sample(
                    sample.id,
                    inst_cd=inst,
                    replace_existing=replace_existing,
                ),
            )
        return out

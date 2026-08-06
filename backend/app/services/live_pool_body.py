"""Refresh scenario step testcases from the live fnx_testcase pool."""

from __future__ import annotations

from app.core.exceptions import InvalidInputError
from app.models.fnx_testcase import FnxTestcase
from app.repositories.fnx_testcase_repo import FnxTestcaseRepository
from app.utils.json_text import loads_json


async def apply_live_pool_bodies_to_testcases(
    tc_repo: FnxTestcaseRepository,
    testcases: list[FnxTestcase],
) -> None:
    """
    Re-fetch each row from ``fnx_testcase`` so a run uses the latest pool body.

    Rows loaded elsewhere in the same request may be stale (e.g. materialized
    right before running); this guards against that by re-reading the current
    pool row by natural key. Raises when a pool case is missing or has an
    empty body. Mutates ``testcases`` in place (replaces stale rows).
    """
    for idx, tc in enumerate(testcases):
        live = await tc_repo.get(
            inst_cd=tc.inst_cd,
            svc_code=tc.svc_code,
            rule_case_id=tc.rule_case_id,
        )
        if live is None:
            raise InvalidInputError(
                f"원본 테스트케이스가 없습니다: {tc.svc_code} / {tc.rule_case_id}. "
                "Rules에서 테스트케이스를 다시 생성하세요.",
            )
        body = loads_json(live.request_body_json, {})
        if not isinstance(body, dict) or len(body) == 0:
            raise InvalidInputError(
                f"원본 Input이 비어 있습니다: {live.svc_code} / {live.rule_case_id}. "
                "YAML input을 채운 뒤 테스트케이스를 다시 생성하세요.",
            )
        testcases[idx] = live

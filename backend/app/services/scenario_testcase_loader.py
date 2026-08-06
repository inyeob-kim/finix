"""Shared loader: resolve ordered FnxTestcase rows for a scenario's steps."""

from __future__ import annotations

from app.models.fnx_testcase import FnxTestcase
from app.repositories.fnx_testcase_repo import FnxTestcaseRepository
from app.utils.json_text import loads_json
from app.utils.scenario_steps_document import parse_steps_list


async def list_testcases_for_steps(
    *,
    steps_json: str | None,
    tc_repo: FnxTestcaseRepository,
    inst_cd: str,
) -> list[FnxTestcase]:
    """
    Load one FnxTestcase per scenario step, in step order.

    Steps without a resolved ``service_code`` + ``rule_case_id`` pair (not yet
    attached/generated) are skipped.
    """
    raw_steps = parse_steps_list(loads_json(steps_json, []))
    out: list[FnxTestcase] = []
    for step in raw_steps:
        if not isinstance(step, dict):
            continue
        svc_code = step.get("service_code")
        rule_case_id = step.get("rule_case_id")
        if not isinstance(svc_code, str) or not svc_code.strip():
            continue
        if not isinstance(rule_case_id, str) or not rule_case_id.strip():
            continue
        tc = await tc_repo.get(
            inst_cd=inst_cd,
            svc_code=svc_code.strip(),
            rule_case_id=rule_case_id.strip(),
        )
        if tc is not None:
            out.append(tc)
    return out

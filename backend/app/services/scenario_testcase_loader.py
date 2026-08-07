"""Shared loader: resolve ordered FnxTestcase rows for a scenario's steps."""

from __future__ import annotations

from app.core.exceptions import InvalidInputError
from app.models.fnx_testcase import FnxTestcase
from app.repositories.fnx_testcase_repo import FnxTestcaseRepository
from app.utils.json_text import loads_json
from app.utils.scenario_steps_document import parse_steps_list


def _parse_pin_version(raw: object) -> int | None:
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int) and raw > 0:
        return raw
    if isinstance(raw, str) and raw.strip().isdigit():
        value = int(raw.strip())
        return value if value > 0 else None
    return None


async def list_testcases_for_steps(
    *,
    steps_json: str | None,
    tc_repo: FnxTestcaseRepository,
    inst_cd: str,
) -> list[FnxTestcase]:
    """
    Load one FnxTestcase per scenario step, in step order.

    When ``tc_hist_version`` is set on a step, load that hist snapshot (pinned).
    Otherwise load the current pool row (legacy / unpinned).

    Steps without a resolved ``service_code`` + ``rule_case_id`` pair (not yet
    attached/generated) are skipped.
    """
    raw_steps = parse_steps_list(loads_json(steps_json, []))
    out: list[FnxTestcase] = []
    for step_i, step in enumerate(raw_steps):
        if not isinstance(step, dict):
            continue
        svc_code = step.get("service_code")
        rule_case_id = step.get("rule_case_id")
        if not isinstance(svc_code, str) or not svc_code.strip():
            continue
        if not isinstance(rule_case_id, str) or not rule_case_id.strip():
            continue
        svc = svc_code.strip()
        cid = rule_case_id.strip()
        pin = _parse_pin_version(step.get("tc_hist_version"))
        if pin is not None:
            hist = await tc_repo.get_hist(
                inst_cd=inst_cd,
                svc_code=svc,
                rule_case_id=cid,
                version=pin,
            )
            if hist is None:
                raise InvalidInputError(
                    f"시나리오 스텝 {step_i + 1}: 핀된 테스트케이스 버전을 찾을 수 없습니다 "
                    f"({svc}/{cid} v{pin})."
                )
            out.append(tc_repo.testcase_from_hist(hist))
            continue

        tc = await tc_repo.get(
            inst_cd=inst_cd,
            svc_code=svc,
            rule_case_id=cid,
        )
        if tc is not None:
            out.append(tc)
    return out

"""Resolve scenario step bodies from the live pool by service_code + case_id."""

from __future__ import annotations

from typing import Any

from app.core.exceptions import InvalidInputError
from app.models.testcase import TestCase
from app.repositories.metadata_repo import MetadataRepository
from app.utils.json_text import loads_json
from app.utils.scenario_steps_document import parse_steps_list
from app.utils.testcase_case_id import parse_case_id_from_testcase_name


def _service_code_from_step(row: Any) -> str | None:
    if not isinstance(row, dict):
        return None
    for key in ("service_code", "serviceCode", "code"):
        raw = row.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    return None


async def apply_live_pool_bodies_to_testcases(
    metadata: MetadataRepository,
    testcases: list[TestCase],
    *,
    steps_json: str | None,
) -> None:
    """
    Overwrite each testcase's request/expect fields from the current pool twin.

    Raises InvalidInputError when the pool case is missing or has an empty body.
    Mutates ``testcases`` in place for the subsequent resolve/run pass.
    """
    raw_steps = parse_steps_list(loads_json(steps_json, []))
    for idx, tc in enumerate(testcases):
        step_i = tc.step_index if tc.step_index is not None else idx
        service_code: str | None = None
        if 0 <= step_i < len(raw_steps):
            service_code = _service_code_from_step(raw_steps[step_i])
        case_id = parse_case_id_from_testcase_name(
            tc.name or "",
            service_code=service_code,
        )
        if not case_id:
            raise InvalidInputError(
                f"스텝 {step_i + 1}: case_id를 확인할 수 없습니다. "
                "풀 테스트케이스를 다시 선택하세요.",
            )
        if not service_code:
            raise InvalidInputError(
                f"스텝 {step_i + 1} ({case_id}): service_code가 없습니다.",
            )
        live = await metadata.find_pool_testcase_by_service_and_case_id(
            service_code,
            case_id,
        )
        if live is None:
            raise InvalidInputError(
                f"원본 테스트케이스가 없습니다: {service_code} / {case_id}. "
                "Rules에서 테스트케이스를 다시 생성하세요.",
            )
        body = loads_json(live.request_body_json, {})
        if not isinstance(body, dict) or len(body) == 0:
            raise InvalidInputError(
                f"원본 Input이 비어 있습니다: {service_code} / {case_id}. "
                "YAML input을 채운 뒤 테스트케이스를 다시 생성하세요.",
            )
        tc.name = live.name
        tc.http_method = live.http_method
        tc.endpoint = live.endpoint
        tc.request_body_json = live.request_body_json
        tc.expected_status = live.expected_status
        tc.expected_body_json = live.expected_body_json
        tc.rule_history_id = live.rule_history_id

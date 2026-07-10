"""Live execution step evaluation (CBS BXMC response shape)."""

from app.domain.execution_assertion_catalog import (
    ERROR_INVALID_REQUEST,
    ERROR_RESPONSE_STRUCTURE,
)
from app.domain.execution_step_evaluator import (
    evaluate_live_step_result,
    normalize_cbs_response_body,
)


def test_normalize_cbs_response_body_unwraps_single_item_array():
    payload = [{"messageId": "AAPCME0006", "status": 500}]
    assert normalize_cbs_response_body(payload) == payload[0]


def test_error_case_passes_with_message_id_and_http_500():
    body = [
        {
            "status": 500,
            "messageId": "AAPCME0006",
            "message": "지점식별자은/는 필수 입력 항목입니다.",
            "exception": "bankware.cloud.bxmc.ext.exception.BizApplicationException",
        },
    ]
    result = evaluate_live_step_result(
        testcase_name="[E] PY025-E-001 · AAPCME0006",
        expected_status=400,
        expected_body={"outcome": "error", "error_code": "AAPCME0006"},
        actual_status=500,
        actual_body=body,
    )
    assert result.passed is True
    assert all(a.passed for a in result.assertions)
    assert {a.name for a in result.assertions} == {
        ERROR_INVALID_REQUEST,
        ERROR_RESPONSE_STRUCTURE,
    }


def test_error_case_fails_when_message_id_mismatch():
    result = evaluate_live_step_result(
        testcase_name="[E] TC-1",
        expected_status=400,
        expected_body={"outcome": "error", "error_code": "AAPCME0006"},
        actual_status=500,
        actual_body={
            "messageId": "OTHER",
            "status": 500,
            "message": "x",
            "exception": "BizApplicationException",
        },
    )
    assert result.passed is False
    structure = next(a for a in result.assertions if a.name == ERROR_RESPONSE_STRUCTURE)
    assert structure.passed is False
    assert "AAPCME0006" in (structure.message or "")


def test_happy_case_passes_on_2xx():
    result = evaluate_live_step_result(
        testcase_name="[N] TC-1",
        expected_status=200,
        expected_body={"outcome": "success"},
        actual_status=200,
        actual_body={"result": "ok"},
    )
    assert result.passed is True
    assert all(a.passed for a in result.assertions)

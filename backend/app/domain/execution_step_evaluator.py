"""Evaluate Live HTTP step results (mirrors Postman Tests for CBS BXMC)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.domain.execution_assertion_catalog import (
    ERROR_INVALID_REQUEST,
    ERROR_RESPONSE_STRUCTURE,
    HAPPY_NO_ERROR_CODE,
    UNEXPECTED_SUCCESS,
    happy_status_test_name,
)
from app.domain.postman_chaining import effective_error_http_status, is_postman_error_case


@dataclass(slots=True)
class StepAssertion:
    name: str
    passed: bool
    message: str | None = None


@dataclass(slots=True)
class StepEvaluation:
    passed: bool
    assertions: list[StepAssertion]


def normalize_cbs_response_body(body: Any) -> Any:
    """Unwrap ``[{...}]`` CBS error payloads to a single object."""
    if isinstance(body, list) and len(body) == 1 and isinstance(body[0], dict):
        return body[0]
    return body


def _biz_error_code_from_body(row: dict[str, Any]) -> str:
    return str(
        row.get("messageId")
        or row.get("errorCode")
        or row.get("error_code")
        or row.get("code")
        or "",
    ).strip()


def _error_code_assertion_message(expected: str, actual: str) -> str:
    return f"expected '{actual or '(empty)'}' to equal '{expected}'"


def evaluate_live_step_result(
    *,
    testcase_name: str,
    expected_status: int | None,
    expected_body: dict[str, Any] | None,
    actual_status: int | None,
    actual_body: Any,
) -> StepEvaluation:
    """
    Return structured assertions for one Live HTTP step.

    Aligns with Postman native Tests: error cases expect HTTP 500 + messageId.
    """
    assertions: list[StepAssertion] = []
    exp_body = expected_body if isinstance(expected_body, dict) else {}
    is_error = is_postman_error_case(
        testcase_name=testcase_name,
        expected_status=expected_status,
        expected_body=exp_body,
    )

    if actual_status is None:
        assertions.append(
            StepAssertion(
                name=ERROR_INVALID_REQUEST,
                passed=False,
                message="HTTP 응답 없음",
            ),
        )
        return StepEvaluation(passed=False, assertions=assertions)

    if is_error:
        exp_http = effective_error_http_status(expected_status)
        if 200 <= actual_status < 300:
            assertions.append(
                StepAssertion(
                    name=UNEXPECTED_SUCCESS,
                    passed=False,
                    message="Expected error response",
                ),
            )
            return StepEvaluation(passed=False, assertions=assertions)

        status_ok = actual_status == exp_http
        assertions.append(
            StepAssertion(
                name=ERROR_INVALID_REQUEST,
                passed=status_ok,
                message=None
                if status_ok
                else f"expected {exp_http} to equal {actual_status}",
            ),
        )

        structure_errors: list[str] = []
        row = normalize_cbs_response_body(actual_body)
        if not isinstance(row, dict):
            structure_errors.append("response body is not a JSON object")
        else:
            body_status = row.get("status")
            if body_status is not None and int(body_status) != exp_http:
                structure_errors.append(
                    f"expected body.status {exp_http}, got {body_status}",
                )
            if not row.get("exception"):
                structure_errors.append("expected exception field to exist")

            error_code = str(exp_body.get("error_code") or "").strip()
            if error_code:
                actual_code = _biz_error_code_from_body(row)
                if actual_code != error_code:
                    structure_errors.append(
                        _error_code_assertion_message(error_code, actual_code),
                    )
            elif not str(row.get("message") or "").strip():
                structure_errors.append("expected message string")

        assertions.append(
            StepAssertion(
                name=ERROR_RESPONSE_STRUCTURE,
                passed=len(structure_errors) == 0,
                message="; ".join(structure_errors) if structure_errors else None,
            ),
        )
        passed = all(a.passed for a in assertions)
        return StepEvaluation(passed=passed, assertions=assertions)

    exp_http = expected_status if expected_status is not None else 200
    if expected_status is not None:
        status_ok = actual_status == exp_http
        assertions.append(
            StepAssertion(
                name=happy_status_test_name(expected_status),
                passed=status_ok,
                message=None
                if status_ok
                else f"expected {exp_http} to equal {actual_status}",
            ),
        )
    else:
        status_ok = 200 <= actual_status < 300
        assertions.append(
            StepAssertion(
                name=happy_status_test_name(None),
                passed=status_ok,
                message=None if status_ok else f"expected 2xx, got {actual_status}",
            ),
        )

    row = normalize_cbs_response_body(actual_body)
    stray = _biz_error_code_from_body(row) if isinstance(row, dict) else ""
    no_error_ok = not stray
    assertions.append(
        StepAssertion(
            name=HAPPY_NO_ERROR_CODE,
            passed=no_error_ok,
            message=None if no_error_ok else f"unexpected error code {stray}",
        ),
    )

    passed = all(a.passed for a in assertions)
    return StepEvaluation(passed=passed, assertions=assertions)


def evaluate_simulate_step_result(
    *,
    testcase_name: str,
    expected_status: int | None,
    expected_body: dict[str, Any] | None,
    actual_status: int | None,
    actual_body: Any,
) -> StepEvaluation:
    """Structured assertions for deterministic simulate mode (Postman-aligned names)."""
    live = evaluate_live_step_result(
        testcase_name=testcase_name,
        expected_status=expected_status,
        expected_body=expected_body,
        actual_status=actual_status,
        actual_body=actual_body,
    )
    return live

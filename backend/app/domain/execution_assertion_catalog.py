"""Shared Postman / Live assertion names (keep FINIX and Postman in sync)."""

from __future__ import annotations

ERROR_INVALID_REQUEST = "Should return error for invalid request"
ERROR_RESPONSE_STRUCTURE = "Error response structure"
UNEXPECTED_SUCCESS = "Unexpected success for error case"
HAPPY_NO_ERROR_CODE = "No errorCode in happy path"
INJECT_WARNING = "Inject warning"


def happy_status_test_name(expected_status: int | None) -> str:
    if expected_status is not None:
        return f"Status code is {expected_status}"
    return "HTTP status is 2xx"

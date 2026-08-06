"""Deterministic fake HTTP responses for local execution (no real HTTP I/O)."""

from __future__ import annotations

from typing import Any

from app.models.fnx_testcase import FnxTestcase
from app.utils.json_text import loads_json


def simulate_response(
    testcase: FnxTestcase,
    *,
    request_body: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any]]:
    """
    Return a synthetic (status, body) pair for a stored test case.

    Mirrors the demo mismatch when a withdraw validation case would expect 400.
    When ``request_body`` is provided (after scenario injects), success responses
    echo request fields into the body so extract/json_path can be exercised locally.
    """
    exp_status = testcase.expected_status or 200
    endpoint = (testcase.endpoint or "").lower()
    expected_body = loads_json(testcase.expected_body_json, {})
    req = (
        request_body
        if request_body is not None
        else loads_json(testcase.request_body_json, {})
    )
    if not isinstance(req, dict):
        req = {}

    if "withdraw" in endpoint and exp_status == 400:
        return 500, {"error": "internal_server_error"}

    if exp_status >= 400:
        return exp_status, expected_body

    if isinstance(expected_body, dict) and isinstance(req, dict):
        merged = {**expected_body, **req}
        return exp_status, merged

    return exp_status, expected_body

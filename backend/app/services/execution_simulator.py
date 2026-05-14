"""Deterministic fake HTTP responses for local execution (no real HTTP I/O)."""

from __future__ import annotations

from typing import Any

from app.models.testcase import TestCase
from app.utils.json_text import loads_json


def simulate_response(testcase: TestCase) -> tuple[int, dict[str, Any]]:
    """
    Return a synthetic (status, body) pair for a stored test case.

    Mirrors the demo mismatch when a withdraw validation case would expect 400.
    """
    exp_status = testcase.expected_status or 200
    endpoint = (testcase.endpoint or "").lower()
    expected_body = loads_json(testcase.expected_body_json, {})

    if "withdraw" in endpoint and exp_status == 400:
        return 500, {"error": "internal_server_error"}

    if exp_status >= 400:
        return exp_status, expected_body

    return exp_status, expected_body

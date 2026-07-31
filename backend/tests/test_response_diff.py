"""Unit tests for response body diff with ignore_paths."""

from app.domain.execution_assertion_catalog import HAPPY_RESPONSE_DIFF
from app.domain.execution_step_evaluator import evaluate_live_step_result
from app.domain.response_diff import (
    DEFAULT_IGNORE_PATHS,
    diff_json_paths,
    should_compare_response_body,
    strip_ignore_paths,
)


def test_strip_ignore_paths_removes_nested_leaves():
    data = {"acct": "1", "txDt": "20260101", "nested": {"traceId": "x", "bal": 10}}
    out = strip_ignore_paths(data, ["txDt", "nested.traceId"])
    assert out == {"acct": "1", "nested": {"bal": 10}}


def test_diff_json_paths_ignores_default_volatility_fields():
    expected = {"acctNo": "A1", "txDt": "20260101", "balance": 100}
    actual = {"acctNo": "A1", "txDt": "20261231", "balance": 100, "guid": "g"}
    assert diff_json_paths(expected, actual) == []


def test_diff_json_paths_reports_payload_mismatch():
    expected = {"acctNo": "A1", "balance": 100}
    actual = {"acctNo": "A1", "balance": 99}
    assert diff_json_paths(expected, actual, ignore_paths=DEFAULT_IGNORE_PATHS) == [
        "balance"
    ]


def test_should_compare_response_body_skips_meta_only():
    assert should_compare_response_body({"outcome": "success"}) is False
    assert should_compare_response_body({"outcome": "success", "balance": 1}) is True


def test_happy_path_response_diff_passes_when_ignore_paths_match():
    result = evaluate_live_step_result(
        testcase_name="[N] TC-1",
        expected_status=200,
        expected_body={
            "outcome": "success",
            "acctNo": "A1",
            "txDt": "20260101",
            "balance": 100,
        },
        actual_status=200,
        actual_body={"acctNo": "A1", "txDt": "20990101", "balance": 100},
        ignore_paths=["txDt"],
    )
    assert result.passed is True
    diff = next(a for a in result.assertions if a.name == HAPPY_RESPONSE_DIFF)
    assert diff.passed is True


def test_happy_path_response_diff_fails_on_payload_change():
    result = evaluate_live_step_result(
        testcase_name="[N] TC-1",
        expected_status=200,
        expected_body={"outcome": "success", "balance": 100},
        actual_status=200,
        actual_body={"balance": 50},
        ignore_paths=[],
    )
    assert result.passed is False
    diff = next(a for a in result.assertions if a.name == HAPPY_RESPONSE_DIFF)
    assert diff.passed is False
    assert "balance" in (diff.message or "")

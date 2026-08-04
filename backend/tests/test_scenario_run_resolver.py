"""Tests for scenario run resolver."""

from app.domain.scenario_bindings import ExtractSpec, InjectSpec
from app.models.testcase import TestCase
from app.services.scenario_run_resolver import resolve_scenario_run
from app.utils.json_text import dumps_json


def _tc(
    tid: int,
    *,
    step_index: int,
    body: dict,
    status: int = 200,
) -> TestCase:
    return TestCase(
        id=tid,
        scenario_id=1,
        name=f"TC-{tid}",
        steps=None,
        http_method="POST",
        endpoint="/api/x",
        request_body_json=dumps_json(body),
        expected_status=status,
        expected_body_json="{}",
        step_index=step_index,
        rule_history_id=None,
    )


def test_resolve_inject_from_prior_extract():
    steps_json = dumps_json(
        [
            {
                "id": "s1",
                "number": 1,
                "action": "A",
                "result": "success",
                "extracts": [{"var": "token", "json_path": "$.token"}],
            },
            {
                "id": "s2",
                "number": 2,
                "action": "B",
                "result": "success",
                "injects": [{"var": "token", "json_path": "$.authToken"}],
            },
        ],
    )
    t1 = _tc(1, step_index=0, body={"x": 1})
    t2 = _tc(2, step_index=1, body={"authToken": ""})

    def sim(tc: TestCase, body: dict) -> tuple[int, dict]:
        if tc.id == 1:
            return 200, {"token": "abc"}
        return 200, {"ok": True, "echo": body}

    preview = resolve_scenario_run(
        [t1, t2],
        steps_json=steps_json,
        simulate_response=sim,
    )
    assert preview.steps[0].resolved_request_body == {"x": 1}
    assert preview.steps[1].resolved_request_body["authToken"] == "abc"
    assert preview.context_after.get("token") == "abc"
    assert preview.steps[0].context_after_step == {"token": "abc"}
    assert preview.steps[1].context_after_step == {"token": "abc"}
    assert not preview.steps[1].inject_warnings


def test_override_on_first_step():
    steps_json = dumps_json(
        [
            {
                "id": "s1",
                "number": 1,
                "action": "A",
                "result": "success",
                "overrides": [{"json_path": "$.accountNo", "value": "RUN-OVERRIDE"}],
            },
        ],
    )
    tc = _tc(1, step_index=0, body={"accountNo": "TEMPLATE"})
    preview = resolve_scenario_run([tc], steps_json=steps_json)
    assert preview.steps[0].resolved_request_body["accountNo"] == "RUN-OVERRIDE"


def test_missing_inject_var_warns():
    steps_json = dumps_json(
        [
            {
                "id": "s2",
                "number": 1,
                "action": "B",
                "result": "success",
                "injects": [{"var": "missing", "json_path": "$.id"}],
            },
        ],
    )
    tc = _tc(1, step_index=0, body={})
    preview = resolve_scenario_run([tc], steps_json=steps_json)
    assert preview.steps[0].inject_warnings

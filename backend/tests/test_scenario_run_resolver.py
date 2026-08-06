"""Tests for scenario run resolver."""

from app.domain.scenario_bindings import ExtractSpec, InjectSpec
from app.models.fnx_testcase import FnxTestcase
from app.services.scenario_run_resolver import resolve_scenario_run
from app.utils.json_text import dumps_json


def _tc(
    tid: int,
    *,
    body: dict,
    status: int = 200,
) -> FnxTestcase:
    return FnxTestcase(
        inst_cd="1001",
        svc_code="SVC",
        rule_case_id=f"C-{tid}",
        name=f"TC-{tid}",
        http_method="POST",
        endpoint="/api/x",
        request_body_json=dumps_json(body),
        expected_status=status,
        expected_body_json="{}",
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
    t1 = _tc(1, body={"x": 1})
    t2 = _tc(2, body={"authToken": ""})

    def sim(tc: FnxTestcase, body: dict) -> tuple[int, dict]:
        if tc.rule_case_id == "C-1":
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
    tc = _tc(1, body={"accountNo": "TEMPLATE"})
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
    tc = _tc(1, body={})
    preview = resolve_scenario_run([tc], steps_json=steps_json)
    assert preview.steps[0].inject_warnings


def test_resolves_yaml_dynamic_macros():
    tc = _tc(
        1,
        body={"pymntDt": "{{$date.today()}}", "traceId": "{{$generator.uuid()}}"},
    )
    preview = resolve_scenario_run([tc], steps_json="[]")
    body = preview.steps[0].resolved_request_body
    assert isinstance(body["pymntDt"], str) and body["pymntDt"].isdigit()
    assert isinstance(body["traceId"], str) and len(body["traceId"]) >= 32

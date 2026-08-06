"""Postman export body building with scenario bindings (overrides + injects + extracts)."""

from app.domain.postman_chaining import build_postman_request_body, merge_postman_events
from app.domain.scenario_bindings import ExtractSpec, InjectSpec, OverrideSpec
from app.models.fnx_testcase import FnxTestcase
from app.services.scenario_run_resolver import bindings_by_logical_step, resolve_scenario_run
from app.utils.json_text import dumps_json, loads_json


def _tc(tid: int, *, body: dict) -> FnxTestcase:
    return FnxTestcase(
        inst_cd="1001",
        svc_code="SVC",
        rule_case_id=f"C-{tid}",
        name=f"TC-{tid}",
        http_method="POST",
        endpoint="/api/x",
        request_body_json=dumps_json(body),
        expected_status=200,
        expected_body_json="{}",
    )


def test_postman_native_body_overrides_and_inject_placeholders():
    steps_json = dumps_json(
        [
            {
                "number": 1,
                "action": "A",
                "result": "success",
                "overrides": [{"json_path": "$.custId", "value": "C-99"}],
                "extracts": [{"var": "arrIdNbr", "json_path": "$.arrIdNbr"}],
            },
            {
                "number": 2,
                "action": "B",
                "result": "success",
                "injects": [{"var": "arrIdNbr", "json_path": "$.arrIdNbr"}],
            },
        ],
    )
    binding_map = bindings_by_logical_step(steps_json)
    t1 = _tc(1, body={"custId": "T1", "arrIdNbr": "T1"})
    t2 = _tc(2, body={"arrIdNbr": ""})

    inj0, ext0, ov0 = binding_map.get(0, ([], [], []))
    inj1, ext1, ov1 = binding_map.get(1, ([], [], []))

    body0 = build_postman_request_body(
        loads_json(t1.request_body_json, {}),
        injects=inj0,
        overrides=ov0,
    )
    body1 = build_postman_request_body(
        loads_json(t2.request_body_json, {}),
        injects=inj1,
        overrides=ov1,
    )

    assert body0["custId"] == "C-99"
    assert body1["arrIdNbr"] == "{{arrIdNbr}}"

    events0 = merge_postman_events(extracts=ext0, injects=inj0, expected_status=200)
    events1 = merge_postman_events(extracts=ext1, injects=inj1, expected_status=200)
    assert any(e["listen"] == "test" for e in events0)
    assert "arrIdNbr" in "\n".join(events0[0]["script"]["exec"])
    assert any(e["listen"] == "prerequest" for e in events1)


def test_postman_resolved_snapshot_includes_overrides_and_injected_values():
    steps_json = dumps_json(
        [
            {
                "number": 1,
                "action": "A",
                "result": "success",
                "overrides": [{"json_path": "$.seed", "value": "SEED-1"}],
                "extracts": [{"var": "arrIdNbr", "json_path": "$.arrIdNbr"}],
            },
            {
                "number": 2,
                "action": "B",
                "result": "success",
                "injects": [{"var": "arrIdNbr", "json_path": "$.arrIdNbr"}],
            },
        ],
    )
    t1 = _tc(1, body={"seed": "x"})
    t2 = _tc(2, body={"arrIdNbr": ""})

    def sim(tc: FnxTestcase, body: dict) -> tuple[int, dict]:
        if tc.rule_case_id == "C-1":
            return 200, {"arrIdNbr": "FROM-STEP-1"}
        return 200, {}

    preview = resolve_scenario_run(
        [t1, t2],
        steps_json=steps_json,
        simulate_response=sim,
    )
    assert preview.steps[0].resolved_request_body["seed"] == "SEED-1"
    assert preview.steps[1].resolved_request_body["arrIdNbr"] == "FROM-STEP-1"

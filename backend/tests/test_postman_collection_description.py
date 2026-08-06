"""Postman collection description (scenario flow) builder."""

from app.domain.postman_collection_config import (
    PostmanCollectionConfig,
    PostmanStartVarSpec,
)
from app.domain.postman_collection_description import build_postman_collection_description
from app.domain.scenario_bindings import ExtractSpec, InjectSpec, OverrideSpec
from app.models.fnx_testcase import FnxTestcase
from app.utils.json_text import dumps_json


def _tc(
    tid: int,
    *,
    name: str,
    method: str = "POST",
    endpoint: str = "/api/x",
) -> FnxTestcase:
    return FnxTestcase(
        inst_cd="1001",
        svc_code="SVC",
        rule_case_id=f"C-{tid}",
        name=name,
        http_method=method,
        endpoint=endpoint,
        request_body_json=dumps_json({}),
        expected_status=200,
        expected_body_json="{}",
    )


def test_build_postman_collection_description_includes_flow_and_bindings():
    t1 = _tc(1, name="[E] PY025-E-001 ? open", endpoint="/open")
    t2 = _tc(2, name="[H] PY026-H-001 ? next", endpoint="/next")
    binding_map = {
        0: (
            [],
            [ExtractSpec(var="arrIdNbr", json_path="$.arrIdNbr")],
            [OverrideSpec(json_path="$.custId", value="C-1")],
        ),
        1: (
            [InjectSpec(var="arrIdNbr", json_path="$.arrIdNbr")],
            [],
            [],
        ),
    }
    cfg = PostmanCollectionConfig(
        start_vars=[
            PostmanStartVarSpec(key="custNm", value="", generator="uuid"),
        ],
    )
    text = build_postman_collection_description(
        title="withdraw-scenario",
        prompt="open-then-withdraw",
        testcases=[t1, t2],
        binding_map=binding_map,
        step_service_codes={0: "PY025", 1: "PY026"},
        postman_config=cfg,
        native=True,
    )
    assert "# withdraw-scenario" in text
    assert "open-then-withdraw" in text
    assert "1. **PY025**" in text
    assert "extract `arrIdNbr`" in text
    assert "2. **PY026**" in text
    assert "inject `$.arrIdNbr`" in text
    assert "{{arrIdNbr}}" in text
    assert "`custNm`" in text
    assert "generator `uuid`" in text
    assert "Collection Runner" in text

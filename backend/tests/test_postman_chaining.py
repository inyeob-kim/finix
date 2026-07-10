"""Tests for Postman script generation."""

from app.domain.postman_chaining import (
    apply_postman_inject_placeholders,
    build_extract_test_script,
    build_postman_test_script,
    is_postman_error_case,
    merge_postman_events,
)
from app.domain.scenario_bindings import ExtractSpec, InjectSpec, OverrideSpec


def test_apply_postman_inject_placeholders():
    body = apply_postman_inject_placeholders(
        {"acctNbr": "111", "meta": {"x": 1}},
        [InjectSpec(var="arrId", json_path="$.acctNbr")],
    )
    assert body["acctNbr"] == "{{arrId}}"


def test_build_extract_test_script_sets_collection_variables():
    events = build_extract_test_script(
        [ExtractSpec(var="arrIdNbr", json_path="$.arrIdNbr")],
        expected_status=200,
    )
    assert events[0]["listen"] == "test"
    script = "\n".join(events[0]["script"]["exec"])
    assert "pm.collectionVariables.set" in script
    assert "arrIdNbr" in script
    assert "No errorCode in happy path" in script


def test_error_case_test_script_checks_message_id_for_error_code():
    events = build_postman_test_script(
        extracts=[],
        expected_status=400,
        expected_body={"outcome": "error", "error_code": "AAPCME0006"},
        testcase_name="[E] PY025-E-001 · AAPCME0006 · dt 누락",
    )
    script = "\n".join(events[0]["script"]["exec"])
    assert "res.messageId" in script
    assert 'pm.expect(bizCode).to.eql("AAPCME0006")' in script
    assert "pm.response.code).to.eql(500)" in script
    assert 'res.message || "").to.include("AAPCME0006")' not in script


def test_happy_case_test_script_uses_2xx_when_status_unset():
    events = build_postman_test_script(
        extracts=[],
        expected_status=None,
        expected_body={"outcome": "success"},
        testcase_name="[N] PY025-N-001",
    )
    script = "\n".join(events[0]["script"]["exec"])
    assert "within(200, 299)" in script
    assert "No errorCode in happy path" in script


def test_is_postman_error_case_detects_e_prefix_and_outcome():
    assert is_postman_error_case(
        testcase_name="[E] X",
        expected_status=None,
        expected_body={},
    )
    assert is_postman_error_case(
        testcase_name="[N] X",
        expected_status=None,
        expected_body={"outcome": "error"},
    )
    assert not is_postman_error_case(
        testcase_name="[N] X",
        expected_status=200,
        expected_body={"outcome": "success"},
    )


def test_merge_postman_events_includes_prerequest_when_injects():
    events = merge_postman_events(
        extracts=[ExtractSpec(var="id", json_path="$.id")],
        injects=[InjectSpec(var="id", json_path="$.id")],
        testcase_name="[N] TC-1",
    )
    listens = {e["listen"] for e in events}
    assert "test" in listens
    assert "prerequest" in listens


def test_merge_postman_events_always_includes_test_script():
    events = merge_postman_events(
        extracts=[],
        injects=[],
        expected_status=400,
        expected_body={"outcome": "error", "error_code": "E1"},
        testcase_name="[E] SVC-E-001",
    )
    assert len(events) == 1
    assert events[0]["listen"] == "test"


def test_build_postman_request_body_applies_overrides_then_placeholders():
    from app.domain.postman_chaining import build_postman_request_body

    body = build_postman_request_body(
        {"arrIdNbr": "TEMPLATE", "amount": 1},
        overrides=[OverrideSpec(json_path="$.amount", value=999)],
        injects=[InjectSpec(var="arrIdNbr", json_path="$.arrIdNbr")],
    )
    assert body["amount"] == 999
    assert body["arrIdNbr"] == "{{arrIdNbr}}"

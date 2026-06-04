"""Tests for Postman script generation."""

from app.domain.postman_chaining import (
    apply_postman_inject_placeholders,
    build_extract_test_script,
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


def test_merge_postman_events_includes_prerequest_when_injects():
    events = merge_postman_events(
        extracts=[ExtractSpec(var="id", json_path="$.id")],
        injects=[InjectSpec(var="id", json_path="$.id")],
    )
    listens = {e["listen"] for e in events}
    assert "test" in listens
    assert "prerequest" in listens


def test_build_postman_request_body_applies_overrides_then_placeholders():
    from app.domain.postman_chaining import build_postman_request_body

    body = build_postman_request_body(
        {"arrIdNbr": "TEMPLATE", "amount": 1},
        overrides=[OverrideSpec(json_path="$.amount", value=999)],
        injects=[InjectSpec(var="arrIdNbr", json_path="$.arrIdNbr")],
    )
    assert body["amount"] == 999
    assert body["arrIdNbr"] == "{{arrIdNbr}}"

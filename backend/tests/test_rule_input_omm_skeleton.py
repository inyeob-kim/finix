"""Tests for OMM / In DTO input skeleton merge."""

from app.utils.rule_input_omm_skeleton import (
    build_input_skeleton_for_generation,
    build_skeleton_from_java_source,
    merge_rule_inputs_with_skeleton,
    merge_skeleton_overlay,
    skeleton_from_catalog_raw_json,
    union_inputs_from_rules_yaml,
)


def test_merge_skeleton_overlay_preserves_extra_keys():
    sk = {"a": None, "b": {"x": None}}
    ov = {"a": "1", "b": {"x": "2"}, "z": 9}
    m = merge_skeleton_overlay(sk, ov)
    assert m["a"] == "1"
    assert m["b"]["x"] == "2"
    assert m["z"] == 9


def test_merge_skeleton_overlay_list_items():
    sk = {"regList": [{"trgtAcctNbr": None, "amt": None}]}
    ov = {"regList": [{"trgtAcctNbr": "111"}]}
    m = merge_skeleton_overlay(sk, ov)
    assert m["regList"] == [{"trgtAcctNbr": "111", "amt": None}]


def test_build_skeleton_from_java_source_simple_dto():
    src = """
public class DemoIn {
    private String custId;
    private Integer age;
    private List<RowIn> rows;
}
class RowIn {
    private String code;
    private long qty;
}
"""
    sk = build_skeleton_from_java_source(src, "DemoIn")
    assert set(sk.keys()) == {"custId", "age", "rows"}
    assert sk["custId"] is None
    assert sk["age"] is None
    assert isinstance(sk["rows"], list)
    assert sk["rows"][0] == {"code": None, "qty": None}


def test_skeleton_from_catalog_input_fields():
    raw = '{"input_fields": [{"field_name": "foo", "nested_dto_class_name": null}, {"field_name": "bar", "nested_dto_class_name": "X"}]}'
    sk = skeleton_from_catalog_raw_json(raw)
    assert sk == {"foo": None, "bar": {}}


def test_union_inputs_from_rules_yaml():
    y = """
service_code: "X"
rules:
  - case_id: "X-E-001"
    input:
      a: 1
      b: {x: 1}
  - case_id: "X-N-001"
    input:
      b: {y: 2}
      c: null
"""
    u = union_inputs_from_rules_yaml(y)
    assert "a" in u and "c" in u
    assert isinstance(u.get("b"), dict)


def test_merge_rule_inputs_with_skeleton_in_payload():
    payload = {
        "service_code": "Z",
        "rules": [
            {
                "case_id": "Z-E-001",
                "input": {"k": 1},
            }
        ],
    }
    merge_rule_inputs_with_skeleton(
        payload,
        {"k": None, "extra": None},
    )
    assert payload["rules"][0]["input"] == {"k": 1, "extra": None}


def test_build_input_skeleton_for_generation_java_and_catalog():
    java = """
public class AcIn {
    private String id;
    private String name;
}
"""
    raw = '{"input_fields": [{"field_name": "legacyOnly", "required_status": "optional"}]}'
    sk = build_input_skeleton_for_generation(
        in_dto="AcIn",
        java_source=java,
        raw_catalog_json=raw,
        existing_yaml=None,
    )
    assert sk["id"] is None
    assert sk["name"] is None
    assert sk["legacyOnly"] is None

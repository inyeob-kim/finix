"""Unit tests for dynamic macro grammar (P0)."""

import pytest

from app.domain.dynamic_macro_resolver import (
    evaluate_macro,
    is_macro_string,
    looks_like_finix_macro,
    parse_macro,
    resolve_mapping,
    validate_input_macros,
    validate_macro_or_raise,
)


def test_parse_pool_and_context():
    p = parse_macro("{{pool.staffId}}")
    assert p is not None
    assert p.kind == "pool"
    assert p.field == "staffId"

    c = parse_macro("{{context.NEW_CUST_ID}}")
    assert c is not None
    assert c.kind == "context"
    assert c.field == "NEW_CUST_ID"


def test_parse_date_and_generator():
    today = parse_macro("{{$date.today()}}")
    assert today is not None and today.kind == "date" and today.fn == "today"
    d = parse_macro("{{$date.addYears(1)}}")
    assert d is not None and d.fn == "addYears" and d.arg == 1
    g = parse_macro("{{$generator.ssn()}}")
    assert g is not None and g.fn == "ssn"


def test_parse_extended_generators():
    assert parse_macro("{{$generator.uuid()}}").fn == "uuid"
    assert parse_macro("{{$generator.random_digits()}}").fn == "random_digits"
    assert parse_macro("{{$generator.my_shared_gen()}}").fn == "my_shared_gen"
    assert parse_macro("{{$generator.korean_name()}}").fn == "korean_name"


def test_parse_name_parts():
    full = parse_macro("{{$generator.name()}}")
    assert full is not None and full.fn == "name" and full.part is None
    family = parse_macro("{{$generator.name.family()}}")
    assert family is not None and family.fn == "name" and family.part == "family"
    given = parse_macro("{{$generator.name.given()}}")
    assert given is not None and given.part == "given"
    middle = parse_macro("{{$generator.name.middle()}}")
    assert middle is not None and middle.part == "middle"
    assert parse_macro("{{$generator.uuid.family()}}") is None


def test_is_macro_string():
    assert is_macro_string("{{pool.a}}")
    assert is_macro_string("{{$generator.name.family()}}")
    assert not is_macro_string("plain")
    assert not is_macro_string(None)
    assert not is_macro_string("{{custId}}")


def test_looks_like_finix_macro_ignores_postman_vars():
    assert looks_like_finix_macro("{{pool.a}}")
    assert looks_like_finix_macro("{{$generator.uuid()}}")
    assert not looks_like_finix_macro("{{custId}}")
    assert not looks_like_finix_macro("plain")


def test_evaluate_context_and_pool():
    assert evaluate_macro("{{context.X}}", context={"X": "v1"}) == "v1"
    assert evaluate_macro("{{pool.staffId}}", pool_fields={"staffId": "S1"}) == "S1"
    with pytest.raises(KeyError):
        evaluate_macro("{{pool.missing}}", pool_fields={})


def test_evaluate_date_and_generator_builtins():
    today = evaluate_macro("{{$date.today()}}")
    assert isinstance(today, str) and len(today) == 8 and today.isdigit()
    uid = evaluate_macro("{{$generator.uuid()}}")
    assert isinstance(uid, str) and len(uid) >= 32
    name = evaluate_macro("{{$generator.name()}}")
    assert isinstance(name, str) and len(name) >= 2
    assert (
        evaluate_macro("{{pool.missing}}", pool_fields={}, on_missing="keep")
        == "{{pool.missing}}"
    )


def test_resolve_mapping_nested():
    out = resolve_mapping(
        {"a": "{{pool.x}}", "b": {"c": "{{context.Y}}"}, "z": 1},
        context={"Y": 9},
        pool_fields={"x": "px"},
    )
    assert out == {"a": "px", "b": {"c": 9}, "z": 1}


def test_resolve_mapping_resolves_date():
    out = resolve_mapping({"pymntDt": "{{$date.today()}}", "z": 1})
    assert out["z"] == 1
    assert isinstance(out["pymntDt"], str) and out["pymntDt"].isdigit()


def test_resolve_mapping_shares_korean_name_parts():
    out = resolve_mapping(
        {
            "full": "{{$generator.name()}}",
            "family": "{{$generator.name.family()}}",
            "given": "{{$generator.name.given()}}",
            "middle": "{{$generator.name.middle()}}",
            "again": "{{$generator.name.full()}}",
        }
    )
    assert out["full"] == out["again"]
    assert out["full"] == out["family"] + out["given"]
    assert out["middle"] == ""
    assert out["family"]
    assert out["given"]


def test_validate_unknown():
    with pytest.raises(ValueError):
        validate_macro_or_raise("{{unknown.x}}")


def test_validate_input_macros_walk():
    errs = validate_input_macros(
        {
            "custId": "{{custId}}",
            "pymntDt": "{{$date.today()}}",
            "bad": "{{$generator.}}",
            "nested": {"x": "{{$date.nope()}}"},
        }
    )
    assert any("bad" in e for e in errs)
    assert any("nested.x" in e for e in errs)
    assert not any("custId" in e for e in errs)
    assert validate_input_macros({"pymntDt": "{{$date.today()}}"}) == []
    assert validate_input_macros({"nm": "{{$generator.name.family()}}"}) == []

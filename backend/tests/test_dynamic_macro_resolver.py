"""Unit tests for dynamic macro grammar (P0)."""

import pytest

from app.domain.dynamic_macro_resolver import (
    evaluate_macro,
    is_macro_string,
    parse_macro,
    resolve_mapping,
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


def test_is_macro_string():
    assert is_macro_string("{{pool.a}}")
    assert not is_macro_string("plain")
    assert not is_macro_string(None)


def test_evaluate_context_and_pool():
    assert evaluate_macro("{{context.X}}", context={"X": "v1"}) == "v1"
    assert evaluate_macro("{{pool.staffId}}", pool_fields={"staffId": "S1"}) == "S1"
    with pytest.raises(KeyError):
        evaluate_macro("{{pool.missing}}", pool_fields={})


def test_resolve_mapping_nested():
    out = resolve_mapping(
        {"a": "{{pool.x}}", "b": {"c": "{{context.Y}}"}, "z": 1},
        context={"Y": 9},
        pool_fields={"x": "px"},
    )
    assert out == {"a": "px", "b": {"c": 9}, "z": 1}


def test_validate_unknown():
    with pytest.raises(ValueError):
        validate_macro_or_raise("{{unknown.x}}")

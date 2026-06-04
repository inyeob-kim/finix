"""Tests for scenario step extract/inject helpers."""

from app.domain.scenario_bindings import (
    ExtractSpec,
    InjectSpec,
    OverrideSpec,
    apply_extracts,
    apply_injects,
    apply_overrides,
    json_path_get,
    json_path_set,
)


def test_json_path_get_set():
    data = {"data": {"accountNo": "123"}}
    assert json_path_get(data, "$.data.accountNo") == "123"
    merged = json_path_set({}, "$.data.accountNo", "123")
    assert merged == {"data": {"accountNo": "123"}}


def test_apply_injects_and_extracts():
    ctx: dict = {}
    body, warns = apply_injects(
        {"amount": 1},
        ctx,
        [InjectSpec(var="acct", json_path="$.accountNo")],
    )
    assert warns
    assert body == {"amount": 1}

    ctx = {"acct": "A001"}
    body, warns = apply_injects(
        {"amount": 1},
        ctx,
        [InjectSpec(var="acct", json_path="accountNo")],
    )
    assert not warns
    assert body["accountNo"] == "A001"

    ctx = apply_extracts(
        {"data": {"accountNo": "A002"}},
        ctx,
        [ExtractSpec(var="acct2", json_path="$.data.accountNo")],
    )
    assert ctx["acct2"] == "A002"


def test_apply_overrides_before_inject():
    template = {"amount": 1, "accountNo": "TEMPLATE"}
    merged = apply_overrides(
        template,
        [OverrideSpec(json_path="$.accountNo", value="FIXED-1")],
    )
    assert merged["accountNo"] == "FIXED-1"
    body, _ = apply_injects(
        merged,
        {"acct": "CTX"},
        [InjectSpec(var="acct", json_path="$.accountNo")],
    )
    assert body["accountNo"] == "CTX"

"""Built-in collection variable generators."""

from app.domain.collection_var_generators import (
    resolve_generator,
    resolve_start_var_value,
)
from app.domain.postman_collection_config import PostmanCollectionConfig, PostmanStartVarSpec
from app.services.http_scenario_runner import initial_context_from_postman


def test_today_generator_is_yyyymmdd():
    value = resolve_generator("today_yyyymmdd")
    assert len(value) == 8
    assert value.isdigit()


def test_korean_rrn_has_check_digit_length():
    value = resolve_generator("korean_rrn")
    assert len(value) == 13
    assert value.isdigit()


def test_literal_wins_without_generator():
    assert resolve_start_var_value(value="ABC", generator=None) == "ABC"
    assert resolve_start_var_value(value="ABC", generator="") == "ABC"


def test_generator_overrides_stored_value():
    out = resolve_start_var_value(value="ignored", generator="uuid")
    assert len(out) == 36


def test_initial_context_resolves_generators():
    cfg = PostmanCollectionConfig(
        start_vars=[
            PostmanStartVarSpec(key="custId", value="C-1"),
            PostmanStartVarSpec(key="custNm", value="", generator="korean_name"),
        ],
    )
    ctx = initial_context_from_postman(cfg)
    assert ctx["custId"] == "C-1"
    assert isinstance(ctx["custNm"], str) and len(ctx["custNm"]) >= 2

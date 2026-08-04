"""Title/description helpers are for prompts; YAML save does not enforce content quality."""

from app.prompts.title_description_guidance import (
    has_hangul,
    is_vague_title,
    validate_rule_title_description,
)
from app.services.service_rules_service import validate_and_prepare_yaml
from tests.test_service_rules_validation import _case_rule


def test_is_vague_title_detects_generic_phrases():
    assert is_vague_title("Business rule enforcement")
    assert is_vague_title("Validation of pymntDt")
    assert is_vague_title("고객 정보 검증")
    assert not is_vague_title("지급일 누락 시 이체 요청이 거절된다")


def test_has_hangul():
    assert has_hangul("지급일 누락 시 거절된다")
    assert not has_hangul("Missing payment date prevents transfer")


def test_validate_rule_title_description_is_noop():
    validate_rule_title_description(
        idx=0,
        title="short",
        description="short",
    )
    validate_rule_title_description(
        idx=0,
        title="Register Bank Limit",
        description="Register Bank Limit",
    )


def test_validate_and_prepare_yaml_accepts_short_or_english_title():
    yaml_text = f"""
service_code: PY016
service_name: Example
rules:
{_case_rule("PY016-E-001", "E", title="Create Limit")}
{_case_rule("PY016-N-001", "N", tags='["business"]')}
"""
    _, payload = validate_and_prepare_yaml(yaml_text)
    assert len(payload["rules"]) == 2
    assert payload["rules"][0]["title"] == "Create Limit"

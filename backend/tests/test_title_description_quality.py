import pytest

from app.core.exceptions import InvalidInputError
from app.prompts.title_description_guidance import (
    is_vague_title,
    validate_rule_title_description,
)
from app.services.service_rules_service import validate_and_prepare_yaml
from tests.test_service_rules_validation import _case_rule


def test_is_vague_title_detects_generic_phrases():
    assert is_vague_title("Business rule enforcement")
    assert is_vague_title("Validation of pymntDt")
    assert not is_vague_title("Missing payment date prevents transfer request")


def test_validate_rule_title_description_rejects_short_and_duplicate():
    with pytest.raises(InvalidInputError, match="title이 너무 짧습니다"):
        validate_rule_title_description(
            idx=0,
            title="Too short",
            description="A long enough description for the testcase purpose.",
        )
    with pytest.raises(InvalidInputError, match="description은 title과 동일"):
        validate_rule_title_description(
            idx=1,
            title="Duplicate customer ID is rejected",
            description="Duplicate customer ID is rejected",
        )


def test_validate_and_prepare_yaml_rejects_vague_title():
    yaml_text = f"""
service_code: PY016
service_name: Example
rules:
{_case_rule("PY016-E-001", "E", title="Business rule enforcement")}
{_case_rule("PY016-N-001", "N", tags='["business"]')}
"""
    with pytest.raises(InvalidInputError, match="title이 모호"):
        validate_and_prepare_yaml(yaml_text)

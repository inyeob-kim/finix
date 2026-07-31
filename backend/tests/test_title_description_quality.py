import pytest

from app.core.exceptions import InvalidInputError
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


def test_validate_rule_title_description_rejects_english_only():
    with pytest.raises(InvalidInputError, match="한국어로 작성"):
        validate_rule_title_description(
            idx=0,
            title="Missing payment date prevents transfer request",
            description="The service rejects the request when payment date is absent.",
        )


def test_validate_rule_title_description_rejects_short_and_duplicate():
    with pytest.raises(InvalidInputError, match="title이 너무 짧습니다"):
        validate_rule_title_description(
            idx=0,
            title="짧은 제목임",
            description="케이스 목적과 검증 이유를 충분히 설명하는 한국어 설명입니다.",
        )
    with pytest.raises(InvalidInputError, match="description은 title과 동일"):
        validate_rule_title_description(
            idx=1,
            title="중복 고객 식별자가 이미 등록되어 있으면 요청이 거절된다",
            description="중복 고객 식별자가 이미 등록되어 있으면 요청이 거절된다",
        )


def test_validate_and_prepare_yaml_rejects_vague_title():
    yaml_text = f"""
service_code: PY016
service_name: Example
rules:
{_case_rule("PY016-E-001", "E", title="고객 정보에 대한 일반적인 입력 검증 처리")}
{_case_rule("PY016-N-001", "N", tags='["business"]')}
"""
    with pytest.raises(InvalidInputError, match="title이 모호"):
        validate_and_prepare_yaml(yaml_text)


def test_validate_rule_title_description_accepts_korean():
    validate_rule_title_description(
        idx=0,
        title="지급일 누락 시 급여이체 요청이 거절된다",
        description="지급일이 없으면 지급 일정과 정산을 수행할 수 없어 서비스를 거절한다.",
    )

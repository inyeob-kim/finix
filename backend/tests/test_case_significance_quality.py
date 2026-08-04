import pytest

from app.core.exceptions import InvalidInputError
from app.prompts.case_significance_guidance import (
    CASE_SIGNIFICANCE_GUIDANCE,
    is_low_value_case,
    validate_rule_case_significance,
)
from app.prompts.service_rules_from_source_prompt import build_system_prompt_from_source
from app.prompts.service_rules_yaml_prompt import build_system_prompt
from app.services.service_rules_service import validate_and_prepare_yaml
from tests.test_service_rules_validation import _GOOD_DESC, _GOOD_TITLE, _case_rule


def test_prompts_include_case_significance_guidance():
    assert "Case significance" in CASE_SIGNIFICANCE_GUIDANCE
    assert "NO required total case count" in CASE_SIGNIFICANCE_GUIDANCE
    assert "Case significance" in build_system_prompt()
    assert "Case significance" in build_system_prompt_from_source()
    assert "15–20" not in build_system_prompt_from_source()


def test_is_low_value_detects_output_assembly_filler():
    rule = {
        "rule_type": "N",
        "title": "Transaction output assembly",
        "description": "Populates fields on success.",
        "expect": {
            "outcome": "success",
            "validation_target": "transaction date/time fields are populated",
        },
        "assertions": [{"path": "$.txDt", "op": "not_null"}],
        "source_evidence": {
            "method": "buildOutput",
            "snippet": "out.setTxDt(...); out.setTxHms(...)",
        },
    }
    assert is_low_value_case(rule)


def test_is_low_value_allows_list_reconciliation_case():
    rule = {
        "rule_type": "N",
        "title": "등록 목록은 제출 계좌마다 결과 행을 반환한다",
        "description": "여러 계좌를 제출하면 입력 행별로 맞춰볼 수 있는 결과 항목을 반환한다.",
        "expect": {
            "outcome": "success",
            "validation_target": "output list size matches input list size",
        },
        "assertions": [{"path": "$.resultList", "op": "not_null"}],
        "source_evidence": {
            "method": "processRegList",
            "snippet": "for (RegItem item : in.getRegList()) { ... }",
        },
    }
    assert not is_low_value_case(rule)


def test_is_low_value_allows_korean_cancellation_success_case():
    """PY030-style business N must not be rejected as filler."""
    rule = {
        "rule_type": "N",
        "title": "활성 약정의 자동이체 해지 요청이 성공적으로 처리된다",
        "description": (
            "활성 상태의 약정에 대해 자동이체 해지를 요청하면 "
            "업무적으로 해지가 완료된 결과를 반환한다."
        ),
        "expect": {
            "outcome": "success",
            "validation_target": "자동이체 해지 처리 결과가 반환된다",
        },
        "assertions": [{"path": "$.procRslt", "op": "not_null"}],
        "source_evidence": {
            "method": "cancelAutoTransfer",
            "snippet": "out.setProcRslt(rslt); out.setTxDt(txDt);",
        },
    }
    assert not is_low_value_case(rule)


def test_validate_and_prepare_yaml_keeps_low_value_normal_case():
    """Content significance is prompt guidance only; schema save keeps the case."""
    yaml_text = f"""
service_code: PY016
service_name: Example
rules:
{_case_rule("PY016-E-001", "E")}
{_case_rule("PY016-N-001", "N")}
  - case_id: PY016-N-099
    rule_type: N
    title: 거래 출력 조립으로 응답 필드를 채운다
    description: 성공 처리 시 응답의 관측 가능한 거래 필드를 채운다.
    input:
      custId: "C1"
    expect:
      outcome: success
      http_status: 200
      validation_target: transaction date/time fields are populated
    assertions:
      - path: "$.txDt"
        op: not_null
    tags: ["business"]
    source_evidence:
      method: buildOutput
      snippet: "out.setTxDt(...); out.setTxHms(...)"
"""
    _, payload = validate_and_prepare_yaml(yaml_text)
    case_ids = [r.get("case_id") for r in payload["rules"]]
    assert "PY016-N-099" in case_ids
    assert "PY016-E-001" in case_ids
    assert "PY016-N-001" in case_ids


def test_validate_and_prepare_yaml_soft_drops_one_bad_rule():
    yaml_text = f"""
service_code: PY016
service_name: Example
rules:
{_case_rule("PY016-E-001", "E")}
{_case_rule("PY016-N-001", "N")}
  - case_id: PY016-N-050
    rule_type: N
    title: ok title
    description: ok description text here
    input: {{}}
    expect:
      outcome: not-a-valid-outcome
      validation_target: ok path
    assertions: []
    tags: ["business"]
    source_evidence:
      method: m
      snippet: "ok"
"""
    with pytest.raises(InvalidInputError):
        validate_and_prepare_yaml(yaml_text)

    _, payload = validate_and_prepare_yaml(
        yaml_text,
        soft_drop_invalid_rules=True,
    )
    case_ids = [r.get("case_id") for r in payload["rules"]]
    assert "PY016-N-050" not in case_ids
    assert "PY016-E-001" in case_ids
    assert "PY016-N-001" in case_ids


def test_validate_rule_case_significance_raises():
    with pytest.raises(InvalidInputError, match="업무 시나리오 가치"):
        validate_rule_case_significance(
            idx=0,
            rule={
                "rule_type": "N",
                "title": "Transaction output assembly",
                "description": _GOOD_DESC,
                "expect": {
                    "validation_target": "fields are populated",
                },
                "assertions": [{"path": "$.x", "op": "not_null"}],
                "source_evidence": {
                    "method": "m",
                    "snippet": "out.setX(v)",
                },
            },
        )

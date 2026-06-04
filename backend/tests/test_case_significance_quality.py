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
        "title": "Registration list returns one result row per submitted account",
        "description": "When multiple accounts are submitted, each row gets a matching result entry.",
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


def test_validate_and_prepare_yaml_rejects_low_value_normal_case():
    yaml_text = f"""
service_code: PY016
service_name: Example
rules:
{_case_rule("PY016-E-001", "E")}
  - case_id: PY016-N-099
    rule_type: N
    title: Transaction output assembly
    description: Successful processing populates observable transaction fields on the response.
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
    with pytest.raises(InvalidInputError):
        validate_and_prepare_yaml(yaml_text)


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

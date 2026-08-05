"""Tests for Finix YAML dump quoting of CBS code strings."""

from app.services.service_rules_service import validate_and_prepare_yaml
from app.utils.finix_yaml_dump import dump_finix_yaml


def test_dump_keeps_leading_zero_codes_quoted():
    text = dump_finix_yaml(
        {
            "rules": [
                {
                    "input": {
                        "actorNmList": [
                            {"actorNmTpCd": "08", "actorNm": "x"},
                            {"actorNmTpCd": "9", "actorNm": "y"},
                        ]
                    }
                }
            ]
        }
    )
    assert "actorNmTpCd: '08'" in text
    assert "actorNmTpCd: '9'" in text


def test_prepare_yaml_preserves_quoted_tp_codes_for_js_yaml():
    raw = """
service_code: CU008
rules:
  - case_id: CU008-N-001
    rule_type: N
    title: t
    description: d
    tags: [business]
    input:
      actorNmList:
        - actorNmTpCd: '08'
          actorNm: '{{$generator.name.middle()}}'
    expect:
      outcome: success
      http_status: 200
    assertions: []
"""
    canonical, _ = validate_and_prepare_yaml(raw)
    assert "actorNmTpCd: '08'" in canonical

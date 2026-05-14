from app.core.exceptions import InvalidInputError
from app.services.service_rules_service import _validate_and_parse_yaml


def test_validate_and_parse_yaml_accepts_minimal_shape():
    payload = _validate_and_parse_yaml(
        """
service_code: PY016
service_name: Example
rules:
  - rule_id: PY016-E-001
    rule_type: error
    title: required missing
    description: ok
    expect:
      http_status: 400
  - rule_id: PY016-B-001
    rule_type: business
    title: biz
    expect: { http_status: 409 }
  - rule_id: PY016-C-001
    rule_type: code
    title: tech
    expect: { http_status: 500 }
"""
    )
    assert payload["service_code"] == "PY016"
    assert isinstance(payload["rules"], list)


def test_validate_and_parse_yaml_rejects_duplicate_rule_id():
    try:
        _validate_and_parse_yaml(
            """
service_code: PY016
rules:
  - rule_id: PY016-E-001
    rule_type: error
    title: a
    expect: { http_status: 400 }
  - rule_id: PY016-E-001
    rule_type: error
    title: b
    expect: { http_status: 400 }
"""
        )
    except InvalidInputError as e:
        assert "중복" in str(e)
    else:
        raise AssertionError("expected InvalidInputError")


def test_validate_and_parse_yaml_requires_all_rule_types():
    try:
        _validate_and_parse_yaml(
            """
service_code: PY016
rules:
  - rule_id: PY016-E-001
    rule_type: error
    title: a
    expect: { http_status: 400 }
"""
        )
    except InvalidInputError as e:
        assert "누락" in str(e)
    else:
        raise AssertionError("expected InvalidInputError")


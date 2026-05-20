from app.core.exceptions import InvalidInputError
from app.services.service_rules_service import (
    autofill_missing_assertions,
    normalize_duplicate_case_ids,
    normalize_legacy_rule_fields,
    truncate_source_evidence_snippets,
    validate_and_prepare_yaml,
)


def _case_rule(
    case_id: str,
    rule_type: str,
    *,
    title: str = "title",
    description: str = "description",
    assertions: str | None = None,
    error_code: str = "ERR001",
    outcome: str = "error",
    validation_target: str = "response field is populated",
    tags: str = '["input"]',
) -> str:
    if assertions is None:
        if rule_type == "E":
            assertions_block = f"""
    assertions:
      - path: "$.error_code"
        op: equals
        value: {error_code}"""
        else:
            assertions_block = """
    assertions:
      - path: "$.txDt"
        op: not_null"""
    else:
        assertions_block = f"\n    assertions: {assertions}"

    expect_block = f"""
      outcome: {outcome}
      http_status: 400
      error_code: {error_code}"""
    if rule_type == "N":
        expect_block = f"""
      outcome: success
      http_status: 200
      validation_target: {validation_target}"""

    return f"""
  - case_id: {case_id}
    rule_type: {rule_type}
    title: {title}
    description: {description}
    input:
      custId: null
    expect:{expect_block}{assertions_block}
    tags: {tags}
    source_evidence:
      method: execute
      snippet: "throw new BizApplicationException(\\"{error_code}\\")"
"""


def test_validate_and_prepare_yaml_accepts_new_schema():
    yaml_text = f"""
service_code: PY016
service_name: Example
rules:
{_case_rule("PY016-E-001", "E")}
{_case_rule("PY016-N-001", "N", tags='["business"]')}
"""
    _, payload = validate_and_prepare_yaml(yaml_text)
    assert payload["service_code"] == "PY016"
    assert len(payload["rules"]) == 2
    assert payload["rules"][0]["case_id"] == "PY016-E-001"
    assert payload["rules"][0]["input"] == {"custId": None}
    assert "rule_id" not in payload["rules"][0]


def test_validate_and_prepare_yaml_normalizes_duplicate_case_ids():
    yaml_text = f"""
service_code: PY016
rules:
{_case_rule("PY016-E-001", "E", title="a")}
{_case_rule("PY016-E-001", "E", title="b")}
{_case_rule("PY016-N-001", "N", tags='["business"]')}
"""
    canonical, payload = validate_and_prepare_yaml(yaml_text)
    ids = [r["case_id"] for r in payload["rules"]]
    assert ids == ["PY016-E-001", "PY016-E-002", "PY016-N-001"]
    assert "PY016-E-002" in canonical


def test_normalize_duplicate_case_ids_renumbers_by_type():
    payload = {
        "service_code": "AC001",
        "rules": [
            {"case_id": "dup", "rule_type": "E"},
            {"case_id": "dup", "rule_type": "N"},
        ],
    }
    out = normalize_duplicate_case_ids(payload)
    assert [r["case_id"] for r in out["rules"]] == [
        "AC001-E-001",
        "AC001-N-001",
    ]


def test_autofill_inserts_error_code_assertion():
    payload = {
        "rules": [
            {
                "rule_type": "E",
                "expect": {"error_code": "BAPPYE0008"},
            }
        ]
    }
    out = autofill_missing_assertions(payload)
    assertions = out["rules"][0]["assertions"]
    assert len(assertions) == 1
    assert assertions[0]["path"] == "$.error_code"
    assert assertions[0]["value"] == "BAPPYE0008"


def test_autofill_does_not_fill_when_assertions_explicitly_empty():
    payload = {
        "rules": [
            {
                "rule_type": "E",
                "expect": {"error_code": "BAPPYE0008"},
                "assertions": [],
            }
        ]
    }
    out = autofill_missing_assertions(payload)
    assert out["rules"][0]["assertions"] == []


def test_validate_autofills_then_passes_for_empty_error_assertions():
    yaml_text = f"""
service_code: PY016
rules:
  - case_id: PY016-E-001
    rule_type: E
    title: a
    description: d
    input:
      custId: null
    expect:
      outcome: error
      http_status: 400
      error_code: BAPPYE0008
    tags: ["input"]
    source_evidence:
      method: validate
      snippet: "throw new BizApplicationException(\\"BAPPYE0008\\")"
{_case_rule("PY016-N-001", "N", tags='["business"]')}
"""
    _, payload = validate_and_prepare_yaml(yaml_text)
    err = payload["rules"][0]
    assert err["assertions"][0]["value"] == "BAPPYE0008"


def test_validate_rejects_error_without_assertions_and_no_error_code():
    yaml_text = f"""
service_code: PY016
rules:
  - case_id: PY016-E-001
    rule_type: E
    title: a
    description: d
    input: {{}}
    expect:
      outcome: error
      http_status: 400
    assertions:
      - path: "$.error_code"
        op: equals
        value: E1
    tags: ["input"]
    source_evidence:
      method: validate
      snippet: "guard clause"
{_case_rule("PY016-N-001", "N", tags='["business"]')}
"""
    try:
        validate_and_prepare_yaml(yaml_text)
    except InvalidInputError as e:
        assert "error_code" in str(e)
    else:
        raise AssertionError("expected InvalidInputError")


def test_truncate_source_evidence_snippet():
    long_snippet = "x" * 300
    payload = {
        "rules": [
            {
                "source_evidence": {
                    "method": "m",
                    "snippet": "line1\nline2 " + long_snippet,
                }
            }
        ]
    }
    out = truncate_source_evidence_snippets(payload)
    snippet = out["rules"][0]["source_evidence"]["snippet"]
    assert len(snippet) <= 200
    assert "\n" not in snippet


def test_validate_rejects_invalid_tags():
    yaml_text = f"""
service_code: PY016
rules:
  - case_id: PY016-E-001
    rule_type: E
    title: a
    description: d
    input: {{}}
    expect:
      outcome: error
      http_status: 400
      error_code: E1
    assertions:
      - path: "$.error_code"
        op: equals
        value: E1
    tags: ["legacy-tag-xyz"]
    source_evidence:
      method: validate
      snippet: "guard clause"
{_case_rule("PY016-N-001", "N", tags='["business"]')}
"""
    try:
        validate_and_prepare_yaml(yaml_text)
    except InvalidInputError as e:
        assert "tags" in str(e)
    else:
        raise AssertionError("expected InvalidInputError")


def test_validate_rejects_invalid_source_evidence():
    yaml_text = f"""
service_code: PY016
rules:
  - case_id: PY016-E-001
    rule_type: E
    title: a
    description: d
    input: {{}}
    expect:
      outcome: error
      http_status: 400
      error_code: E1
    assertions:
      - path: "$.error_code"
        op: equals
        value: E1
    tags: ["input"]
    source_evidence:
      method: ""
      snippet: "x"
{_case_rule("PY016-N-001", "N", tags='["business"]')}
"""
    try:
        validate_and_prepare_yaml(yaml_text)
    except InvalidInputError as e:
        assert "source_evidence" in str(e)
    else:
        raise AssertionError("expected InvalidInputError")


def test_validate_requires_both_rule_types():
    try:
        validate_and_prepare_yaml(
            f"""
service_code: PY016
rules:
{_case_rule("PY016-E-001", "E")}
"""
        )
    except InvalidInputError as e:
        assert "누락" in str(e)
    else:
        raise AssertionError("expected InvalidInputError")


def test_normalize_legacy_rule_fields_maps_old_schema():
    payload = {
        "service_code": "PY016",
        "rules": [
            {
                "rule_id": "PY016-NEG-001",
                "rule_type": "error",
                "title": "t",
                "description": "d",
                "minimal_input": {"custId": None},
                "expect": {
                    "outcome": "error",
                    "http_status": 400,
                    "error_code": "E1",
                },
                "assertions": [
                    {"path": "$.error_code", "op": "equals", "value": "E1"}
                ],
                "tags": ["validation"],
            },
            {
                "rule_id": "PY016-C-001",
                "rule_type": "code",
                "title": "t2",
                "description": "output check",
                "minimal_input": {},
                "expect": {"outcome": "success", "http_status": 200},
                "assertions": [{"path": "$.txDt", "op": "not_null"}],
                "tags": ["implementation"],
            },
        ],
    }
    out = normalize_legacy_rule_fields(payload)
    assert out["rules"][0]["case_id"] == "PY016-NEG-001"
    assert out["rules"][0]["rule_type"] == "E"
    assert out["rules"][0]["input"] == {"custId": None}
    assert out["rules"][0]["tags"] == ["input"]
    assert out["rules"][1]["rule_type"] == "N"
    assert out["rules"][1]["expect"]["validation_target"] == "output check"


def test_validate_accepts_null_http_status_and_empty_assertions():
    yaml_text = """
service_code: PY016
service_name: Example
source_version: "test"
dto:
  in:
    name: "In"
  out:
    name: "Out"
rules:
  - case_id: PY016-E-001
    rule_type: E
    title: Validation failure
    description: Source documents error without HTTP mapping.
    input:
      custId: null
    expect:
      outcome: error
      error_code: E1
    assertions: []
    tags: ["input"]
    source_evidence:
      method: validate
      snippet: "throw new BizApplicationException(\\"E1\\")"
  - case_id: PY016-N-001
    rule_type: N
    title: Success path
    description: Happy path without HTTP code in spec.
    input:
      custId: "C1"
    expect:
      outcome: success
      validation_target: core identifiers are returned
    assertions: []
    tags: ["business"]
    source_evidence:
      method: execute
      snippet: "out.setTxDt"
"""
    _, payload = validate_and_prepare_yaml(yaml_text)
    assert payload["rules"][0]["expect"].get("http_status") in (None, "")
    assert payload["rules"][0]["assertions"] == []
    assert payload["rules"][1]["assertions"] == []


def test_validate_rejects_non_integer_http_status_when_present():
    yaml_text = """
service_code: PY016
service_name: Example
source_version: "test"
dto:
  in:
    name: "In"
  out:
    name: "Out"
rules:
  - case_id: PY016-E-001
    rule_type: E
    title: t
    description: d
    input: {}
    expect:
      outcome: error
      http_status: not-a-number
      error_code: E1
    assertions:
      - path: "$.error_code"
        op: equals
        value: E1
    tags: ["input"]
    source_evidence:
      method: m
      snippet: "x"
  - case_id: PY016-N-001
    rule_type: N
    title: t2
    description: d2
    input: {}
    expect:
      outcome: success
      http_status: 200
      validation_target: ok
    assertions:
      - path: "$.txDt"
        op: not_null
    tags: ["business"]
    source_evidence:
      method: m2
      snippet: "y"
"""
    try:
        validate_and_prepare_yaml(yaml_text)
    except InvalidInputError as e:
        assert "http_status" in str(e)
    else:
        raise AssertionError("expected InvalidInputError")

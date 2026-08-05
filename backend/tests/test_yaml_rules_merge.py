"""Tests for shared YAML rule merge (source AI → existing base)."""

from app.domain.postman_rules_plans import MergeDecision, MergePlan
from app.domain.yaml_rules_merge import (
    apply_yaml_rules_merge_plan,
    fallback_yaml_rules_merge_plan,
    merge_candidate_payload_from_rule,
)


def test_apply_yaml_merge_match_keeps_expect_and_macros():
    base = [
        {
            "case_id": "SVC-N-001",
            "rule_type": "N",
            "title": "postman happy",
            "input": {"nm": "{{$generator.name()}}", "dt": None},
            "expect": {"outcome": "success", "http_status": 200},
            "assertions": [{"path": "$.ok", "equals": True}],
        }
    ]
    generated = [
        {
            "case_id": "TMP-N-001",
            "rule_type": "N",
            "title": "소스 정상",
            "input": {"nm": "홍길동", "dt": "20260101"},
            "expect": {"outcome": "success"},
        }
    ]
    plan = MergePlan(
        decisions=[
            MergeDecision(
                candidate_index=0,
                action="match",
                match_case_id="SVC-N-001",
                input_strategy="fill_nulls_only",
            )
        ]
    )
    payload, diff = apply_yaml_rules_merge_plan(
        service_code="SVC",
        service_name="Service",
        base_rules=base,
        generated_rules=generated,
        plan=plan,
        skeleton={"nm": None, "dt": None},
    )
    assert diff.updated == 1
    assert diff.added == 0
    rule = payload.rules[0]
    assert rule["case_id"] == "SVC-N-001"
    assert rule["expect"]["outcome"] == "success"
    # fill_nulls_only keeps non-empty base (macro) and fills null dt
    assert rule["input"]["nm"] == "{{$generator.name()}}"
    assert rule["input"]["dt"] == "20260101"
    assert rule["assertions"] == [{"path": "$.ok", "equals": True}]


def test_apply_yaml_merge_add_preserves_error_rule():
    base = [
        {
            "case_id": "SVC-N-001",
            "rule_type": "N",
            "title": "happy",
            "input": {"a": 1},
            "expect": {"outcome": "success"},
        }
    ]
    generated = [
        {
            "rule_type": "E",
            "title": "잔액부족",
            "description": "from source",
            "input": {"a": 0},
            "expect": {"outcome": "error", "error_code": "E001"},
            "assertions": [],
        }
    ]
    plan = MergePlan(
        decisions=[
            MergeDecision(
                candidate_index=0,
                action="add",
                title="잔액부족",
                description="from source",
            )
        ]
    )
    payload, diff = apply_yaml_rules_merge_plan(
        service_code="SVC",
        service_name="Service",
        base_rules=base,
        generated_rules=generated,
        plan=plan,
        skeleton={"a": None},
    )
    assert diff.added == 1
    assert diff.kept == 1
    by_id = {r["case_id"]: r for r in payload.rules}
    assert "SVC-N-001" in by_id
    assert "SVC-E-001" in by_id
    assert by_id["SVC-E-001"]["expect"]["error_code"] == "E001"
    assert by_id["SVC-E-001"]["rule_type"] == "E"


def test_fallback_adds_all_generated():
    plan = fallback_yaml_rules_merge_plan(
        [{"title": "a"}, {"title": "b", "description": "d"}]
    )
    assert len(plan.decisions) == 2
    assert all(d.action == "add" for d in plan.decisions)


def test_merge_candidate_payload_shape():
    payload = merge_candidate_payload_from_rule(
        0,
        {
            "rule_type": "E",
            "title": "t",
            "input": {"x": 1},
            "expect": {"outcome": "error", "error_code": "E1"},
        },
    )
    assert payload["index"] == 0
    assert payload["folder"] == "E"
    assert payload["body"] == {"x": 1}
    assert payload["error_code"] == "E1"

"""Tests for deterministic Postman → rules create/merge apply."""

from app.domain.postman_collection_parse import PostmanRequestCandidate
from app.domain.postman_rules_merge import apply_create_plan, apply_merge_plan
from app.domain.postman_rules_plans import (
    CreateCaseSpec,
    CreatePlan,
    ExpectHint,
    MergeDecision,
    MergePlan,
)


def _cand(
    index: int,
    *,
    name: str = "case",
    body: dict | None = None,
    description: str = "",
) -> PostmanRequestCandidate:
    return PostmanRequestCandidate(
        index=index,
        name=name,
        folder="",
        method="POST",
        path="/X",
        body=body or {},
        description=description,
        test_script_excerpt="",
    )


def test_apply_create_plan_builds_case_ids_and_inputs():
    candidates = [
        _cand(0, name="ok", body={"a": 1}),
        _cand(1, name="fail balance", body={"a": 2}, description="거절"),
    ]
    plan = CreatePlan(
        cases=[
            CreateCaseSpec(
                candidate_indices=[0],
                rule_type="N",
                title="정상",
                description="ok",
                expect_hint=ExpectHint(outcome="success", http_status=200),
            ),
            CreateCaseSpec(
                candidate_indices=[1],
                rule_type="E",
                title="잔액부족",
                description="fail",
                expect_hint=ExpectHint(outcome="error", error_code="E001"),
            ),
        ]
    )
    payload, diff = apply_create_plan(
        service_code="SVC",
        service_name="Service",
        candidates=candidates,
        plan=plan,
        skeleton={"a": None, "b": "{{macro}}"},
    )
    assert diff.added == 2
    assert [r["case_id"] for r in payload.rules] == [
        "SVC-N-001",
        "SVC-E-001",
    ]
    assert payload.rules[0]["input"]["a"] == 1
    assert payload.rules[0]["expect"]["outcome"] == "success"
    assert payload.rules[0]["assertions"] == []
    assert payload.rules[1]["expect"]["error_code"] == "E001"


def test_apply_create_plan_fallback_when_plan_none():
    candidates = [_cand(0, name="happy", body={"x": 1})]
    payload, diff = apply_create_plan(
        service_code="SVC",
        service_name="Service",
        candidates=candidates,
        plan=None,
        skeleton={},
    )
    assert diff.added == 1
    assert payload.rules[0]["rule_type"] == "N"


def test_apply_merge_plan_match_keeps_expect():
    base = [
        {
            "case_id": "SVC-N-001",
            "rule_type": "N",
            "title": "base",
            "input": {"a": "{{keep}}", "b": None},
            "expect": {"outcome": "success", "http_status": 200},
        }
    ]
    candidates = [_cand(0, name="upd", body={"a": "postman", "b": 9})]
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
    payload, diff = apply_merge_plan(
        service_code="SVC",
        service_name="Service",
        base_rules=base,
        candidates=candidates,
        plan=plan,
        skeleton={"a": None, "b": None},
    )
    assert diff.updated == 1
    assert diff.added == 0
    rule = payload.rules[0]
    assert rule["case_id"] == "SVC-N-001"
    assert rule["expect"]["outcome"] == "success"
    assert rule["input"]["a"] == "{{keep}}"
    assert rule["input"]["b"] == 9


def test_apply_merge_plan_keep_base_macros():
    base = [
        {
            "case_id": "SVC-N-001",
            "rule_type": "N",
            "title": "base",
            "input": {"a": "{{macro}}", "b": "literal"},
            "expect": {"outcome": "success"},
        }
    ]
    candidates = [_cand(0, name="upd", body={"a": "postman", "b": "from_postman"})]
    plan = MergePlan(
        decisions=[
            MergeDecision(
                candidate_index=0,
                action="match",
                match_case_id="SVC-N-001",
                input_strategy="keep_base_macros",
            )
        ]
    )
    payload, _diff = apply_merge_plan(
        service_code="SVC",
        service_name="Service",
        base_rules=base,
        candidates=candidates,
        plan=plan,
        skeleton={"a": None, "b": None},
    )
    rule = payload.rules[0]
    assert rule["input"]["a"] == "{{macro}}"
    assert rule["input"]["b"] == "literal"

def test_apply_merge_plan_demotes_bad_match_to_add():
    base = [
        {
            "case_id": "SVC-N-001",
            "rule_type": "N",
            "title": "base",
            "input": {"a": 1},
            "expect": {"outcome": "success"},
        }
    ]
    candidates = [_cand(0, name="new", body={"z": 1})]
    plan = MergePlan(
        decisions=[
            MergeDecision(
                candidate_index=0,
                action="match",
                match_case_id="MISSING",
            )
        ]
    )
    payload, diff = apply_merge_plan(
        service_code="SVC",
        service_name="Service",
        base_rules=base,
        candidates=candidates,
        plan=plan,
        skeleton={},
    )
    assert diff.updated == 0
    assert diff.added == 1
    assert diff.kept == 1
    assert len(payload.rules) == 2

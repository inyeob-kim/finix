"""Tests for Postman import AI plan JSON parsing."""

import pytest

from app.services.postman_rules_import_ai_service import (
    parse_create_plan_dict,
    parse_merge_plan_dict,
)


def test_parse_create_plan_dict_ok():
    plan = parse_create_plan_dict(
        {
            "cases": [
                {
                    "candidate_indices": [0, 1],
                    "rule_type": "e",
                    "title": "fail",
                    "description": "d",
                    "expect_hint": {
                        "outcome": "error",
                        "error_code": "X",
                        "http_status": 400,
                    },
                }
            ]
        }
    )
    assert len(plan.cases) == 1
    assert plan.cases[0].rule_type == "E"
    assert plan.cases[0].expect_hint.http_status == 400


def test_parse_create_plan_dict_rejects_empty():
    with pytest.raises(ValueError):
        parse_create_plan_dict({"cases": []})


def test_parse_merge_plan_dict_ok():
    plan = parse_merge_plan_dict(
        {
            "decisions": [
                {
                    "candidate_index": 0,
                    "action": "match",
                    "match_case_id": "A-N-001",
                    "input_strategy": "fill_nulls_only",
                },
                {
                    "candidate_index": 1,
                    "action": "add",
                    "title": "new",
                },
            ]
        }
    )
    assert len(plan.decisions) == 2
    assert plan.decisions[0].input_strategy == "fill_nulls_only"
    assert plan.decisions[1].action == "add"

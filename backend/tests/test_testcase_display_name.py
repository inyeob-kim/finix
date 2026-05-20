"""Tests for materialized test-case display names."""

from app.utils.testcase_display_name import build_materialized_testcase_name


def _rule(**kwargs):
    base = {
        "case_id": "PY027-E-001",
        "rule_type": "E",
        "title": "pymntDt 누락",
        "description": "긴 설명 " * 20,
        "expect": {"outcome": "error", "error_code": "AAPCME0006"},
    }
    base.update(kwargs)
    return base


def test_error_case_uses_title_and_error_code():
    name = build_materialized_testcase_name(
        case_id="PY027-E-001",
        rule=_rule(),
    )
    assert name == "[E] PY027-E-001 · AAPCME0006 · pymntDt 누락"
    assert "긴 설명" not in name


def test_normal_case_omits_error_code():
    name = build_materialized_testcase_name(
        case_id="PY027-N-001",
        rule={
            "rule_type": "N",
            "title": "정상 응답",
            "expect": {"outcome": "success", "validation_target": "txDt"},
        },
    )
    assert name == "[N] PY027-N-001 · 정상 응답"


def test_falls_back_to_validation_target_then_description():
    name = build_materialized_testcase_name(
        case_id="PY027-N-002",
        rule={
            "rule_type": "N",
            "description": "d" * 80,
            "expect": {"outcome": "success", "validation_target": "short vt"},
        },
    )
    assert name.startswith("[N] PY027-N-002 · short vt")


def test_instruction_suffix():
    name = build_materialized_testcase_name(
        case_id="PY027-E-001",
        rule=_rule(),
        instruction="회귀",
    )
    assert name.endswith("(회귀)")


def test_minimal_error_without_title():
    name = build_materialized_testcase_name(
        case_id="PY027-E-002",
        rule={
            "rule_type": "E",
            "expect": {"outcome": "error", "error_code": "E99"},
        },
    )
    assert name == "[E] PY027-E-002 · E99"

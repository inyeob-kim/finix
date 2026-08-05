"""Tests for case_id parsing from materialized names."""

from app.utils.testcase_case_id import parse_case_id_from_testcase_name


def test_parse_new_format_normal():
    assert (
        parse_case_id_from_testcase_name("[N] CU008-N-001 · 개인고객 등록")
        == "CU008-N-001"
    )


def test_parse_new_format_error():
    assert (
        parse_case_id_from_testcase_name(
            "[E] PY027-E-001 · AAPCME0006 · pymntDt 누락",
        )
        == "PY027-E-001"
    )


def test_parse_legacy_format():
    assert (
        parse_case_id_from_testcase_name(
            "CU008 CU008-N-001 개인고객 등록",
            service_code="CU008",
        )
        == "CU008-N-001"
    )


def test_parse_empty():
    assert parse_case_id_from_testcase_name("") is None

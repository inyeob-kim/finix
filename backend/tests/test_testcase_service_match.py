"""Tests for service-code matching on materialized testcase names."""

from app.domain.testcase_service_match import name_matches_service_code


def test_matches_current_bracket_names():
    assert name_matches_service_code(
        "[E] PY016-E-001 · AAPCME0006 · pymntDt 누락",
        "PY016",
    )
    assert name_matches_service_code(
        "[N] PY016-N-001 · 정상 요청",
        "PY016",
    )


def test_matches_legacy_prefix():
    assert name_matches_service_code("PY016 happy path", "PY016")


def test_rejects_other_service():
    assert not name_matches_service_code(
        "[E] PY017-E-001 · x",
        "PY016",
    )
    assert not name_matches_service_code("PY017 foo", "PY016")

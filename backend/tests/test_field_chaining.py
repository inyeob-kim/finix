"""Tests for generic field chaining inference."""

from app.domain.field_chaining import (
    infer_adjacent_step_links,
    operation_roles,
    reusability_score,
)


def test_reusability_score_detects_identifier_patterns():
    assert reusability_score("arrIdNbr") >= 0.8
    assert reusability_score("customerId") >= 0.8
    assert reusability_score("description") < 0.3


def test_operation_roles_producer_consumer():
    roles = operation_roles("Open Account", "PY001_OPEN")
    assert "producer" in roles
    roles2 = operation_roles("Close Account Inquiry", "PY002_CLOSE")
    assert "consumer" in roles2 or "inquiry" in roles2


def test_infer_adjacent_links_fuzzy_and_suffix():
    contexts = [
        {
            "index": 0,
            "service_code": "SVC_A",
            "service_name": "Create Customer",
            "input_paths": [],
            "output_paths": ["customerId", "token"],
        },
        {
            "index": 1,
            "service_code": "SVC_B",
            "service_name": "Open Account",
            "input_paths": ["custId", "acctNbr"],
            "output_paths": ["arrIdNbr"],
        },
    ]
    links = infer_adjacent_step_links(contexts)
    assert links
    vars_used = {lk["var"] for lk in links}
    assert "customerId" in vars_used or "custId" in vars_used

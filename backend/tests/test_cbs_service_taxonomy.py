"""CBS service taxonomy helpers."""

from __future__ import annotations

from app.domain.cbs_service_taxonomy import (
    UNCLASSIFIED_DOMAIN,
    build_taxonomy_map,
    infer_business_domain,
    taxonomy_from_raw_row,
)


def test_infer_business_domain_known_prefix():
    assert infer_business_domain("PY016") == "PAYMENT"
    assert infer_business_domain("dp001") == "DEPOSIT"


def test_infer_business_domain_unknown():
    assert infer_business_domain("ZZ999") == UNCLASSIFIED_DOMAIN
    assert infer_business_domain("X") == UNCLASSIFIED_DOMAIN


def test_taxonomy_from_raw_row_prefers_catalog_fields():
    tax = taxonomy_from_raw_row(
        "PY016",
        {"business_domain": "PAYMENT", "component_code": "PYS"},
    )
    assert tax.business_domain == "PAYMENT"
    assert tax.component_code == "PYS"


def test_taxonomy_from_raw_row_falls_back_to_prefix():
    tax = taxonomy_from_raw_row("LN010", None)
    assert tax.business_domain == "LOAN"
    assert tax.component_code == ""


def test_build_taxonomy_map():
    mapped = build_taxonomy_map(
        {
            "AC001": {"business_domain": "ACCOUNTING", "component_code": "ACS"},
            "PY001": {"CMPNT_CD": "PYS"},
        }
    )
    assert mapped["AC001"].business_domain == "ACCOUNTING"
    assert mapped["AC001"].component_code == "ACS"
    assert mapped["PY001"].business_domain == "PAYMENT"
    assert mapped["PY001"].component_code == "PYS"

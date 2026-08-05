"""CBS service business domain / component taxonomy helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

UNCLASSIFIED_DOMAIN = "UNCLASSIFIED"
UNCLASSIFIED_COMPONENT = ""

# Mirrors the CASE mapping in cbs_srvc.json export SQL.
DOMAIN_BY_PREFIX: dict[str, str] = {
    "AC": "ACCOUNTING",
    "AM": "ASSESSMENT",
    "AR": "ARRANGEMENT",
    "AS": "ASSET",
    "AT": "ACTOR",
    "BP": "PARTNER",
    "CL": "COLLATERAL",
    "CM": "COMMON",
    "CR": "CALCULATOR",
    "CU": "CUSTOMER",
    "DC": "DOCUMENT",
    "DP": "DEPOSIT",
    "DT": "DEPARTMENT",
    "FX": "FOREIGNEXCHANGE",
    "IA": "INTERNALACCOUNT",
    "LM": "LIMIT",
    "LN": "LOAN",
    "PD": "PRODUCT",
    "PY": "PAYMENT",
    "SF": "STAFF",
    "ST": "SETTLEMENT",
    "SV": "SERVICEMANAGEMENT",
    "TR": "TREASURY",
    "UE": "UNDEREXAMINATION",
    "XP": "EXTERNALPROXY",
}


@dataclass(frozen=True, slots=True)
class ServiceTaxonomy:
    business_domain: str
    component_code: str


def infer_business_domain(service_code: str) -> str:
    """Infer domain from the first two characters of SRVC_CD."""
    code = (service_code or "").strip().upper()
    if len(code) < 2:
        return UNCLASSIFIED_DOMAIN
    return DOMAIN_BY_PREFIX.get(code[:2], UNCLASSIFIED_DOMAIN)


def taxonomy_from_raw_row(
    service_code: str,
    raw: Mapping[str, Any] | None,
) -> ServiceTaxonomy:
    """Resolve domain/component from a cbs_srvc raw row, with prefix fallback."""
    domain = ""
    component = ""
    if raw:
        domain = str(
            raw.get("business_domain")
            or raw.get("BUSINESS_DOMAIN")
            or ""
        ).strip()
        component = str(
            raw.get("component_code")
            or raw.get("CMPNT_CD")
            or ""
        ).strip()
    if not domain:
        domain = infer_business_domain(service_code)
    return ServiceTaxonomy(
        business_domain=domain or UNCLASSIFIED_DOMAIN,
        component_code=component,
    )


def build_taxonomy_map(
    raw_by_code: Mapping[str, Mapping[str, Any]],
) -> dict[str, ServiceTaxonomy]:
    """Map service_code → taxonomy for every known catalog row."""
    out: dict[str, ServiceTaxonomy] = {}
    for code, row in raw_by_code.items():
        key = (code or "").strip()
        if not key:
            continue
        out[key] = taxonomy_from_raw_row(key, row)
    return out

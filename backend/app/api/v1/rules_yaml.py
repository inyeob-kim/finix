"""API endpoints for previewing YAML rule bundles.

This endpoint is kept for UI compatibility. It prefers DB-primary rules when present,
falling back to file-based YAML under backend/app/rules_yaml/ when absent.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.rules_yaml.loader import load_service_rules
from app.core.deps import get_service_rules_service
from app.services.service_rules_service import ServiceRulesService

router = APIRouter(prefix="/rules-yaml")

_RULES_DIR = Path(__file__).resolve().parents[2] / "rules_yaml"


class ServiceRulePreview(BaseModel):
    service_code: str
    service_name: str | None = None
    source_version: str | None = None
    exists: bool
    filename: str
    rule_count: int
    rule_ids: list[str]
    raw: dict[str, Any]


@router.get("/{service_code}", response_model=ServiceRulePreview, summary="Preview YAML rules")
async def get_rules_yaml(
    service_code: str,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRulePreview:
    """Return YAML bundle preview used by UI before generation."""
    code = (service_code or "").strip()
    filename = f"{code}.yaml" if code else ""
    path = (_RULES_DIR / filename) if filename else None
    bundle = None
    # Prefer DB-primary active bundle when present.
    db_bundle = await service.get_active(service_code)
    if db_bundle is not None:
        try:
            parsed = json.loads(db_bundle.rules_json or "{}")
        except Exception:  # noqa: BLE001
            parsed = {}
        rules = parsed.get("rules") or []
        if isinstance(rules, list):
            bundle = type(
                "TmpBundle",
                (),
                {
                    "service_code": db_bundle.service_code,
                    "service_name": db_bundle.service_name_snapshot,
                    "source_version": db_bundle.source_version,
                    "rules": [r for r in rules if isinstance(r, dict)],
                },
            )()

    if bundle is None:
        bundle = load_service_rules(service_code)
    if bundle is None:
        return ServiceRulePreview(
            service_code=service_code,
            service_name=None,
            source_version=None,
            exists=bool(path and path.exists()),
            filename=filename,
            rule_count=0,
            rule_ids=[],
            raw={},
        )
    rule_ids: list[str] = []
    for r in bundle.rules:
        rid = r.get("rule_id")
        if isinstance(rid, str) and rid.strip():
            rule_ids.append(rid.strip())
    return ServiceRulePreview(
        service_code=bundle.service_code,
        service_name=bundle.service_name,
        source_version=bundle.source_version,
        exists=bool(path and path.exists()),
        filename=filename,
        rule_count=len(bundle.rules),
        rule_ids=rule_ids,
        raw={
            "service_code": bundle.service_code,
            "service_name": bundle.service_name,
            "source_version": bundle.source_version,
            "rules": bundle.rules,
        },
    )


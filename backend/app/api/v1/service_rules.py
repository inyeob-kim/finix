"""API endpoints for DB-primary service rules."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends

from app.core.deps import get_service_rules_ai_service, get_service_rules_service
from app.schemas.service_rules_schema import (
    ServiceRuleBundleRead,
    ServiceRuleDraftCreate,
    ServiceRuleGenerateDraftRequest,
    ServiceRuleGenerateFromSourceRequest,
    ServiceRuleRollbackRequest,
)
from app.services.service_rules_ai_service import ServiceRulesAiService
from app.services.service_rules_service import ServiceRulesService

router = APIRouter(prefix="/service-rules")


def _to_read(entity, *, include_yaml: bool = False, include_rules: bool = False) -> ServiceRuleBundleRead:
    rules_obj = None
    if include_rules and getattr(entity, "rules_json", None):
        try:
            rules_obj = json.loads(entity.rules_json)
        except Exception:  # noqa: BLE001
            rules_obj = None
    return ServiceRuleBundleRead(
        id=entity.id,
        service_code=entity.service_code,
        service_name_snapshot=entity.service_name_snapshot,
        status=entity.status,
        version=entity.version,
        source_version=entity.source_version,
        checksum=entity.checksum,
        created_by=entity.created_by,
        created_at=getattr(entity, "created_at", None),
        updated_at=getattr(entity, "updated_at", None),
        yaml_text=entity.yaml_text if include_yaml else None,
        rules=rules_obj if include_rules else None,
    )


@router.get(
    "/{service_code}",
    response_model=ServiceRuleBundleRead | None,
    summary="Get active rules bundle for service",
)
async def get_active_rules(
    service_code: str,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead | None:
    bundle = await service.get_active(service_code)
    return _to_read(bundle, include_yaml=True, include_rules=True) if bundle else None


@router.get(
    "/{service_code}/versions",
    response_model=list[ServiceRuleBundleRead],
    summary="List versions for service",
)
async def list_versions(
    service_code: str,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> list[ServiceRuleBundleRead]:
    rows = await service.list_versions(service_code)
    return [_to_read(r) for r in rows]


@router.post(
    "/{service_code}",
    response_model=ServiceRuleBundleRead,
    summary="Create draft rules bundle",
)
async def create_draft(
    service_code: str,
    payload: ServiceRuleDraftCreate,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    bundle = await service.create_draft(
        service_code=service_code,
        yaml_text=payload.yaml_text,
        source_version=payload.source_version,
        created_by=payload.created_by,
    )
    return _to_read(bundle, include_yaml=True, include_rules=True)


@router.post(
    "/{service_code}/generate-draft",
    response_model=ServiceRuleBundleRead,
    summary="Generate draft YAML rules via AI",
)
async def generate_draft_via_ai(
    service_code: str,
    payload: ServiceRuleGenerateDraftRequest,
    service: ServiceRulesAiService = Depends(get_service_rules_ai_service),
) -> ServiceRuleBundleRead:
    bundle = await service.generate_draft(
        service_code=service_code,
        objective=payload.objective,
        include_existing=payload.include_existing,
        created_by=payload.created_by,
    )
    return _to_read(bundle, include_yaml=True, include_rules=True)


@router.post(
    "/{service_code}/generate-draft-from-source",
    response_model=ServiceRuleBundleRead,
    summary="Generate draft YAML from pasted source code (AI, fixed template)",
)
async def generate_draft_from_source(
    service_code: str,
    payload: ServiceRuleGenerateFromSourceRequest,
    service: ServiceRulesAiService = Depends(get_service_rules_ai_service),
) -> ServiceRuleBundleRead:
    """Infer rules from backend source, validate, and persist a new draft bundle."""
    bundle = await service.generate_draft_from_source(
        service_code=service_code,
        source_code=payload.source_code,
        source_version=payload.source_version,
        hints=payload.hints,
        created_by=payload.created_by,
    )
    return _to_read(bundle, include_yaml=True, include_rules=True)


@router.post(
    "/{service_code}/{bundle_id}/approve",
    response_model=ServiceRuleBundleRead,
    summary="Approve rules bundle",
)
async def approve_bundle(
    service_code: str,  # kept in path for clarity, validated via service layer
    bundle_id: int,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    bundle = await service.approve(bundle_id)
    if bundle.service_code != (service_code or "").strip():
        # Prevent cross-service approvals via path mismatch.
        raise ValueError("service_code mismatch")
    return _to_read(bundle)


@router.post(
    "/{service_code}/{bundle_id}/activate",
    response_model=ServiceRuleBundleRead,
    summary="Activate rules bundle",
)
async def activate_bundle(
    service_code: str,
    bundle_id: int,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    bundle = await service.activate(bundle_id)
    if bundle.service_code != (service_code or "").strip():
        raise ValueError("service_code mismatch")
    return _to_read(bundle)


@router.post(
    "/{service_code}/rollback",
    response_model=ServiceRuleBundleRead,
    summary="Rollback active rules to version",
)
async def rollback(
    service_code: str,
    payload: ServiceRuleRollbackRequest,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    bundle = await service.rollback(service_code=service_code, to_version=payload.to_version)
    return _to_read(bundle)


"""API endpoints for DB-primary service rules."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_service_rules_ai_service, get_service_rules_service
from app.core.exceptions import InvalidInputError
from app.schemas.service_rules_schema import (
    ServiceRuleBundleRead,
    ServiceRuleDraftCreate,
    ServiceRuleDraftUpdate,
    ServiceRuleGenerateDraftRequest,
    ServiceRuleGenerateFromSourceRequest,
    ServiceRuleRegistryItemRead,
    ServiceRuleRegistryListResponse,
    ServiceRuleRollbackRequest,
    ServiceRuleValidateYamlRequest,
    ServiceRuleValidateYamlResponse,
)
from app.services.service_rules_ai_service import ServiceRulesAiService
from app.services.service_rules_service import ServiceRulesService

router = APIRouter(prefix="/service-rules")


def _to_read(
    entity,
    *,
    include_yaml: bool = False,
    include_rules: bool = False,
    is_active: bool = False,
) -> ServiceRuleBundleRead:
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
        is_active=is_active,
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
    "/registry",
    response_model=ServiceRuleRegistryListResponse,
    summary="List rule bundles aggregated per service (Rules/Meta UI)",
)
async def list_rules_registry(
    service: ServiceRulesService = Depends(get_service_rules_service),
    query: str | None = Query(default=None),
    status: str | None = Query(default=None, description="active, draft, or approved"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> ServiceRuleRegistryListResponse:
    rows, total = await service.list_registry(
        query=query,
        status=status,
        limit=limit,
        offset=offset,
    )
    items = [
        ServiceRuleRegistryItemRead(
            service_code=r.service_code,
            service_name=r.service_name,
            source_version=r.source_version,
            status=r.status,
            rules=r.rules,
            bundle_id=r.bundle_id,
            bundle_version=r.bundle_version,
            last_updated_at=r.last_updated_at,
            last_updated_by=r.last_updated_by,
            is_active=r.is_active,
            version_count=r.version_count,
            active_bundle_version=r.active_bundle_version,
            draft_bundle_version=r.draft_bundle_version,
            has_approved=r.has_approved,
        )
        for r in rows
    ]
    return ServiceRuleRegistryListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.delete(
    "/{service_code}/bundles/{bundle_id}",
    status_code=204,
    summary="Delete a rules bundle",
)
async def delete_rules_bundle(
    service_code: str,
    bundle_id: int,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> None:
    await service.delete_bundle(service_code=service_code, bundle_id=bundle_id)


@router.get(
    "/{service_code}/bundles/{bundle_id}",
    response_model=ServiceRuleBundleRead,
    summary="Get one rules bundle by id (includes yaml)",
)
async def get_rules_bundle(
    service_code: str,
    bundle_id: int,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    bundle = await service.get_bundle(bundle_id)
    if bundle.service_code != (service_code or "").strip():
        raise InvalidInputError("service_code mismatch")
    active = await service.get_active(service_code)
    is_active = active is not None and active.id == bundle.id
    return _to_read(bundle, include_yaml=True, include_rules=True, is_active=is_active)


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
    return (
        _to_read(bundle, include_yaml=True, include_rules=True, is_active=True)
        if bundle
        else None
    )


@router.get(
    "/{service_code}/versions",
    response_model=list[ServiceRuleBundleRead],
    summary="List versions for service",
)
async def list_versions(
    service_code: str,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> list[ServiceRuleBundleRead]:
    rows = await service.list_versions_with_active_flag(service_code)
    return [_to_read(r, is_active=is_active) for r, is_active in rows]


@router.post(
    "/{service_code}/validate-yaml",
    response_model=ServiceRuleValidateYamlResponse,
    summary="Validate rules YAML without saving",
)
async def validate_yaml(
    service_code: str,
    payload: ServiceRuleValidateYamlRequest,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleValidateYamlResponse:
    """Check YAML shape and rule constraints; does not write to the database."""
    _ = (service_code or "").strip()
    parsed = service.validate_yaml_text(yaml_text=payload.yaml_text)
    rules = parsed.get("rules") or []
    rule_count = len(rules) if isinstance(rules, list) else 0
    sn = parsed.get("service_name")
    service_name = str(sn).strip() if isinstance(sn, str) else None
    return ServiceRuleValidateYamlResponse(service_name=service_name, rule_count=rule_count)


@router.post(
    "/{service_code}",
    response_model=ServiceRuleBundleRead,
    summary="Create new draft rules bundle (new version)",
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


@router.put(
    "/{service_code}/bundles/{bundle_id}",
    response_model=ServiceRuleBundleRead,
    summary="Update existing draft bundle in place (same version)",
)
async def update_draft(
    service_code: str,
    bundle_id: int,
    payload: ServiceRuleDraftUpdate,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    bundle = await service.update_draft(
        service_code=service_code,
        bundle_id=bundle_id,
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


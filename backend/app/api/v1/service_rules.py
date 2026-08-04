"""API endpoints for DB-primary service rules (current + draft + history)."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query

from app.core.deps import (
    get_postman_rules_import_service,
    get_service_rules_ai_service,
    get_service_rules_service,
)
from app.core.exceptions import InvalidInputError
from app.models.service_rule_current import ServiceRuleCurrent
from app.models.service_rule_history import ServiceRuleHistory
from app.schemas.service_rules_schema import (
    PostmanRulesImportRequest,
    PostmanRulesImportResponse,
    PostmanServiceImportResultRead,
    PostmanUnmatchedRequestRead,
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
from app.services.postman_rules_import_service import PostmanRulesImportService
from app.services.service_rules_ai_service import ServiceRulesAiService
from app.services.service_rules_service import ServiceRulesService, _editor_view

router = APIRouter(prefix="/service-rules")


def _rules_from_json(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except Exception:  # noqa: BLE001
        return None
    return parsed if isinstance(parsed, dict) else None


def _to_read_current(
    row: ServiceRuleCurrent,
    *,
    include_yaml: bool = False,
    include_rules: bool = False,
    prefer_draft: bool = True,
) -> ServiceRuleBundleRead:
    view = _editor_view(row) if prefer_draft else {
        "yaml_text": row.yaml_text or "",
        "rules_json": row.rules_json,
        "checksum": row.checksum or "",
        "source_version": row.source_version,
        "status": "active" if row.has_applied else "draft",
        "updated_at": row.updated_at,
        "updated_by": row.updated_by,
        "is_active": row.has_applied,
    }
    return ServiceRuleBundleRead(
        id=row.id,
        service_code=row.service_code,
        service_name_snapshot=row.service_name_snapshot,
        status=str(view["status"]),
        is_active=bool(view["is_active"]),
        version=1 if row.has_applied else 0,
        source_version=view["source_version"],
        checksum=str(view["checksum"] or ""),
        created_by=view["updated_by"],
        created_at=row.created_at,
        updated_at=view["updated_at"],
        yaml_text=str(view["yaml_text"]) if include_yaml else None,
        rules=_rules_from_json(view["rules_json"]) if include_rules else None,
        has_draft=row.has_draft,
        change_kind=None,
    )


def _to_read_history(
    row: ServiceRuleHistory,
    *,
    include_yaml: bool = False,
    include_rules: bool = False,
    is_current: bool = False,
) -> ServiceRuleBundleRead:
    return ServiceRuleBundleRead(
        id=row.id,
        service_code=row.service_code,
        service_name_snapshot=row.service_name_snapshot,
        status="history",
        is_active=is_current,
        version=row.id,
        source_version=row.source_version,
        checksum=row.checksum,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.created_at,
        yaml_text=row.yaml_text if include_yaml else None,
        rules=_rules_from_json(row.rules_json) if include_rules else None,
        has_draft=False,
        change_kind=row.change_kind,
    )


@router.get(
    "/registry",
    response_model=ServiceRuleRegistryListResponse,
    summary="List rule documents aggregated per service (Rules/Meta UI)",
)
async def list_rules_registry(
    service: ServiceRulesService = Depends(get_service_rules_service),
    query: str | None = Query(default=None),
    status: str | None = Query(default=None, description="active or draft"),
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
            version_count=r.history_count,
            active_bundle_version=r.active_bundle_version,
            draft_bundle_version=r.draft_bundle_version,
            has_approved=r.has_approved,
            has_draft=r.has_draft,
            history_count=r.history_count,
        )
        for r in rows
    ]
    return ServiceRuleRegistryListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/import-from-postman",
    response_model=PostmanRulesImportResponse,
    summary="Import Postman Collection/Request into working drafts",
)
async def import_from_postman(
    payload: PostmanRulesImportRequest,
    service: PostmanRulesImportService = Depends(get_postman_rules_import_service),
) -> PostmanRulesImportResponse:
    result = await service.import_collection(
        payload.collection,
        created_by=payload.created_by,
        overwrite_draft=payload.overwrite_draft,
    )
    return PostmanRulesImportResponse(
        services=[
            PostmanServiceImportResultRead(**s.as_dict()) for s in result.services
        ],
        unmatched=[
            PostmanUnmatchedRequestRead(**u.as_dict()) for u in result.unmatched
        ],
    )


@router.delete(
    "/{service_code}/bundles/{bundle_id}",
    status_code=204,
    summary="Delete a history snapshot",
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
    summary="Get current row or history snapshot by id",
)
async def get_rules_bundle(
    service_code: str,
    bundle_id: int,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    entity = await service.get_bundle(bundle_id)
    if entity.service_code != (service_code or "").strip():
        raise InvalidInputError("service_code mismatch")
    if isinstance(entity, ServiceRuleCurrent):
        return _to_read_current(
            entity, include_yaml=True, include_rules=True, prefer_draft=True
        )
    current = await service.get_active(service_code)
    is_current = (
        current is not None
        and current.has_applied
        and current.checksum == entity.checksum
    )
    return _to_read_history(
        entity,
        include_yaml=True,
        include_rules=True,
        is_current=is_current,
    )


@router.get(
    "/{service_code}",
    response_model=ServiceRuleBundleRead | None,
    summary="Get applied rules for service (editor prefers draft when present)",
)
async def get_active_rules(
    service_code: str,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead | None:
    row = await service.get_editor_document(service_code)
    if row is None:
        return None
    if not row.has_applied and not row.has_draft:
        return None
    return _to_read_current(
        row, include_yaml=True, include_rules=True, prefer_draft=True
    )


@router.get(
    "/{service_code}/versions",
    response_model=list[ServiceRuleBundleRead],
    summary="List change history for service",
)
async def list_versions(
    service_code: str,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> list[ServiceRuleBundleRead]:
    rows = await service.list_versions_with_active_flag(service_code)
    return [
        _to_read_history(r, is_current=is_current) for r, is_current in rows
    ]


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
    summary="Upsert working draft YAML",
)
async def create_draft(
    service_code: str,
    payload: ServiceRuleDraftCreate,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    row = await service.create_draft(
        service_code=service_code,
        yaml_text=payload.yaml_text,
        source_version=payload.source_version,
        created_by=payload.created_by,
    )
    return _to_read_current(row, include_yaml=True, include_rules=True)


@router.put(
    "/{service_code}/bundles/{bundle_id}",
    response_model=ServiceRuleBundleRead,
    summary="Update working draft YAML",
)
async def update_draft(
    service_code: str,
    bundle_id: int,
    payload: ServiceRuleDraftUpdate,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    row = await service.update_draft(
        service_code=service_code,
        bundle_id=bundle_id,
        yaml_text=payload.yaml_text,
        source_version=payload.source_version,
        created_by=payload.created_by,
    )
    return _to_read_current(row, include_yaml=True, include_rules=True)


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
    row = await service.generate_draft(
        service_code=service_code,
        objective=payload.objective,
        include_existing=payload.include_existing,
        created_by=payload.created_by,
    )
    return _to_read_current(row, include_yaml=True, include_rules=True)


@router.post(
    "/{service_code}/generate-draft-from-source",
    response_model=ServiceRuleBundleRead,
    summary="Generate draft YAML from pasted source code (AI)",
)
async def generate_draft_from_source(
    service_code: str,
    payload: ServiceRuleGenerateFromSourceRequest,
    service: ServiceRulesAiService = Depends(get_service_rules_ai_service),
) -> ServiceRuleBundleRead:
    row = await service.generate_draft_from_source(
        service_code=service_code,
        source_code=payload.source_code,
        source_version=payload.source_version,
        hints=payload.hints,
        created_by=payload.created_by,
        use_data_pool=payload.use_data_pool,
        use_swagger=payload.use_swagger,
    )
    return _to_read_current(row, include_yaml=True, include_rules=True)


@router.post(
    "/{service_code}/{bundle_id}/activate",
    response_model=ServiceRuleBundleRead,
    summary="Apply working draft to current (snapshot previous)",
)
async def activate_bundle(
    service_code: str,
    bundle_id: int,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    row = await service.activate(bundle_id)
    if row.service_code != (service_code or "").strip():
        raise InvalidInputError("service_code mismatch")
    return _to_read_current(row, prefer_draft=False)


@router.post(
    "/{service_code}/rollback",
    response_model=ServiceRuleBundleRead,
    summary="Restore applied YAML from a history snapshot",
)
async def rollback(
    service_code: str,
    payload: ServiceRuleRollbackRequest,
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    # to_version carries history_id for compatibility.
    row = await service.rollback(
        service_code=service_code, to_version=payload.to_version
    )
    return _to_read_current(row, prefer_draft=False)

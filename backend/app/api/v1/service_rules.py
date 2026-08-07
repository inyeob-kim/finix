"""API endpoints for DB-primary service rules (current + draft + history)."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query

from app.core.deps import (
    get_institution_service,
    get_postman_rules_import_service,
    get_service_rules_ai_service,
    get_service_rules_service,
    get_testcase_service,
    require_active_inst_cd,
)
from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.models.fnx_rule_doc_current import ServiceRuleCurrent
from app.models.fnx_rule_doc_hist import ServiceRuleHistory
from app.schemas.service_rules_schema import (
    PostmanRulesImportPreflightRequest,
    PostmanRulesImportPreflightResponse,
    PostmanRulesImportRequest,
    PostmanRulesImportResponse,
    PostmanServiceImportResultRead,
    PostmanUnmatchedRequestRead,
    ServiceRuleActivateRequest,
    ServiceRuleBundleRead,
    ServiceRuleDraftCreate,
    ServiceRuleDraftUpdate,
    ServiceRuleEditorCasesRead,
    ServiceRuleCaseMetaRead,
    ServiceRuleGenerateDraftRequest,
    ServiceRuleGenerateFromSourceRequest,
    ServiceRuleRegistryItemRead,
    ServiceRuleRegistryListResponse,
    ServiceRuleRollbackRequest,
    ServiceRuleValidateYamlRequest,
    ServiceRuleValidateYamlResponse,
)
from app.services.institution_service import InstitutionService
from app.services.postman_rules_import_service import PostmanRulesImportService
from app.services.service_rules_ai_service import ServiceRulesAiService
from app.services.service_rules_service import ServiceRulesService, _editor_view
from app.services.testcase_service import TestCaseService

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


def _editor_rules_list(payload: dict) -> list[dict]:
    rules = payload.get("rules")
    if isinstance(rules, dict) and isinstance(rules.get("rules"), list):
        return [r for r in rules["rules"] if isinstance(r, dict)]
    return []


def _editor_dict_to_cases(payload: dict) -> ServiceRuleEditorCasesRead:
    """Map case-first editor dict to cases API response."""
    raw_meta = payload.get("case_meta")
    case_meta = []
    if isinstance(raw_meta, list):
        for item in raw_meta:
            if not isinstance(item, dict):
                continue
            case_id = str(item.get("case_id") or "").strip()
            if not case_id:
                continue
            case_meta.append(
                ServiceRuleCaseMetaRead(
                    case_id=case_id,
                    is_applied=bool(item.get("is_applied")),
                    has_draft=bool(item.get("has_draft")),
                    has_pool_testcase=bool(item.get("has_pool_testcase")),
                )
            )
    return ServiceRuleEditorCasesRead(
        service_code=str(payload["service_code"]),
        service_name=payload.get("service_name_snapshot"),
        source_version=payload.get("source_version"),
        status=str(payload["status"]),
        has_draft=bool(payload.get("has_draft")),
        is_active=bool(payload.get("is_active")),
        bundle_id=int(payload.get("id") or 0),
        checksum=str(payload.get("checksum") or ""),
        updated_at=payload.get("updated_at"),
        updated_by=payload.get("created_by"),
        rules=_editor_rules_list(payload),
        yaml_text=str(payload.get("yaml_text") or ""),
        case_meta=case_meta,
    )


def _editor_dict_to_read(payload: dict) -> ServiceRuleBundleRead:
    """Map case-first editor bundle dict to API response."""
    rules = payload.get("rules")
    return ServiceRuleBundleRead(
        id=int(payload["id"]),
        service_code=str(payload["service_code"]),
        service_name_snapshot=payload.get("service_name_snapshot"),
        status=str(payload["status"]),
        is_active=bool(payload["is_active"]),
        version=int(payload.get("version") or 0),
        source_version=payload.get("source_version"),
        checksum=str(payload.get("checksum") or ""),
        created_by=payload.get("created_by"),
        created_at=payload.get("created_at"),
        updated_at=payload.get("updated_at"),
        yaml_text=payload.get("yaml_text"),
        rules=rules if isinstance(rules, dict) else None,
        has_draft=bool(payload.get("has_draft")),
        change_kind=None,
    )


async def _read_editor_bundle(
    service: ServiceRulesService,
    service_code: str,
    *,
    inst_cd: str,
) -> ServiceRuleBundleRead | None:
    payload = await service.get_editor_bundle_dict(service_code, inst_cd=inst_cd)
    if payload is None:
        return None
    return _editor_dict_to_read(payload)


async def _read_editor_cases(
    service: ServiceRulesService,
    service_code: str,
    *,
    inst_cd: str,
) -> ServiceRuleEditorCasesRead | None:
    payload = await service.get_editor_bundle_dict(service_code, inst_cd=inst_cd)
    if payload is None:
        return None
    return _editor_dict_to_cases(payload)


async def _read_editor_bundle_after_write(
    service: ServiceRulesService,
    service_code: str,
    *,
    inst_cd: str,
    row: ServiceRuleCurrent,
) -> ServiceRuleBundleRead:
    bundle = await _read_editor_bundle(service, service_code, inst_cd=inst_cd)
    if bundle is not None:
        return bundle
    return _to_read_current(row, include_yaml=True, include_rules=True, prefer_draft=True)


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
    inst_cd: str = Depends(require_active_inst_cd),
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
        inst_cd=inst_cd,
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
            business_domain=r.business_domain,
            component_code=r.component_code,
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
    "/import-from-postman/preflight",
    response_model=PostmanRulesImportPreflightResponse,
    summary="Parse Postman and list draft conflicts before import",
)
async def import_from_postman_preflight(
    payload: PostmanRulesImportPreflightRequest,
    service: PostmanRulesImportService = Depends(get_postman_rules_import_service),
    institutions: InstitutionService = Depends(get_institution_service),
) -> PostmanRulesImportPreflightResponse:
    """Env substitute + parse + catalog match + draft presence (no AI / no write)."""
    inst_cd = await institutions.assert_active(payload.inst_cd)
    result = await service.preflight_collection(
        payload.collection,
        environment=payload.environment,
        inst_cd=inst_cd,
    )
    return PostmanRulesImportPreflightResponse(
        matched_services=list(result.matched_services),
        draft_services=list(result.draft_services),
        unmatched=[
            PostmanUnmatchedRequestRead(**u.as_dict()) for u in result.unmatched
        ],
        request_count=result.request_count,
        notes=list(result.notes),
    )


@router.post(
    "/import-from-postman",
    response_model=PostmanRulesImportResponse,
    summary="Import Postman Collection/Request into working drafts",
)
async def import_from_postman(
    payload: PostmanRulesImportRequest,
    service: PostmanRulesImportService = Depends(get_postman_rules_import_service),
    institutions: InstitutionService = Depends(get_institution_service),
) -> PostmanRulesImportResponse:
    inst_cd = await institutions.assert_active(payload.inst_cd)
    result = await service.import_collection(
        payload.collection,
        environment=payload.environment,
        created_by=payload.created_by,
        overwrite_draft=payload.overwrite_draft,
        inst_cd=inst_cd,
    )
    return PostmanRulesImportResponse(
        services=[
            PostmanServiceImportResultRead(**s.as_dict()) for s in result.services
        ],
        unmatched=[
            PostmanUnmatchedRequestRead(**u.as_dict()) for u in result.unmatched
        ],
        notes=list(result.notes),
    )


@router.delete(
    "/{service_code}/bundles/{bundle_id}",
    status_code=204,
    summary="Delete a history snapshot",
)
async def delete_rules_bundle(
    service_code: str,
    bundle_id: int,
    inst_cd: str = Depends(require_active_inst_cd),
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
    inst_cd: str = Depends(require_active_inst_cd),
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    entity = await service.get_bundle(bundle_id)
    if entity.service_code != (service_code or "").strip():
        raise InvalidInputError("service_code mismatch")
    if isinstance(entity, ServiceRuleCurrent):
        if (entity.inst_cd or "").strip() != inst_cd.strip():
            raise InvalidInputError("institution mismatch")
        bundle = await _read_editor_bundle(service, service_code, inst_cd=inst_cd)
        if bundle is not None:
            return bundle
        raise EntityNotFoundError("ServiceRuleEditor", service_code)
    current = await service.get_active(service_code, inst_cd=inst_cd)
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
    "/{service_code}/cases",
    response_model=ServiceRuleEditorCasesRead | None,
    summary="List editor rule cases for service (SoT: fnx_rule_case)",
)
async def list_editor_cases(
    service_code: str,
    inst_cd: str = Depends(require_active_inst_cd),
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleEditorCasesRead | None:
    return await _read_editor_cases(service, service_code, inst_cd=inst_cd)


@router.post(
    "/{service_code}/cases/{case_id}/apply",
    response_model=ServiceRuleEditorCasesRead,
    summary="Apply one rule case draft to applied (partial 확정)",
)
async def apply_editor_case(
    service_code: str,
    case_id: str,
    inst_cd: str = Depends(require_active_inst_cd),
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleEditorCasesRead:
    await service.apply_draft_case(
        service_code=service_code,
        case_id=case_id,
        inst_cd=inst_cd,
    )
    payload = await _read_editor_cases(service, service_code, inst_cd=inst_cd)
    if payload is None:
        raise InvalidInputError("편집 문서를 불러오지 못했습니다.")
    return payload


@router.post(
    "/{service_code}/cases/{case_id}/deactivate",
    response_model=ServiceRuleEditorCasesRead,
    summary="Remove one rule case from applied (partial 비확정)",
)
async def deactivate_editor_case(
    service_code: str,
    case_id: str,
    inst_cd: str = Depends(require_active_inst_cd),
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleEditorCasesRead:
    await service.deactivate_applied_case(
        service_code=service_code,
        case_id=case_id,
        inst_cd=inst_cd,
    )
    payload = await _read_editor_cases(service, service_code, inst_cd=inst_cd)
    if payload is None:
        raise InvalidInputError("편집 문서를 불러오지 못했습니다.")
    return payload


@router.get(
    "/{service_code}",
    response_model=ServiceRuleBundleRead | None,
    summary="Get editor document assembled from rule cases",
)
async def get_active_rules(
    service_code: str,
    inst_cd: str = Depends(require_active_inst_cd),
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead | None:
    return await _read_editor_bundle(service, service_code, inst_cd=inst_cd)


@router.get(
    "/{service_code}/versions",
    response_model=list[ServiceRuleBundleRead],
    summary="List change history for service",
)
async def list_versions(
    service_code: str,
    inst_cd: str = Depends(require_active_inst_cd),
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> list[ServiceRuleBundleRead]:
    rows = await service.list_versions_with_active_flag(
        service_code, inst_cd=inst_cd
    )
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
    inst_cd: str = Depends(require_active_inst_cd),
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
    inst_cd: str = Depends(require_active_inst_cd),
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    row = await service.create_draft(
        service_code=service_code,
        yaml_text=payload.yaml_text,
        source_version=payload.source_version,
        created_by=payload.created_by,
        inst_cd=inst_cd,
    )
    return await _read_editor_bundle_after_write(
        service, service_code, inst_cd=inst_cd, row=row
    )


@router.put(
    "/{service_code}/bundles/{bundle_id}",
    response_model=ServiceRuleBundleRead,
    summary="Update working draft YAML",
)
async def update_draft(
    service_code: str,
    bundle_id: int,
    payload: ServiceRuleDraftUpdate,
    inst_cd: str = Depends(require_active_inst_cd),
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    row = await service.update_draft(
        service_code=service_code,
        bundle_id=bundle_id,
        yaml_text=payload.yaml_text,
        source_version=payload.source_version,
        created_by=payload.created_by,
        inst_cd=inst_cd,
    )
    return await _read_editor_bundle_after_write(
        service, service_code, inst_cd=inst_cd, row=row
    )


@router.post(
    "/{service_code}/generate-draft",
    response_model=ServiceRuleBundleRead,
    summary="Generate draft YAML rules via AI",
)
async def generate_draft_via_ai(
    service_code: str,
    payload: ServiceRuleGenerateDraftRequest,
    inst_cd: str = Depends(require_active_inst_cd),
    ai_service: ServiceRulesAiService = Depends(get_service_rules_ai_service),
    rules_service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    row = await ai_service.generate_draft(
        service_code=service_code,
        objective=payload.objective,
        include_existing=payload.include_existing,
        created_by=payload.created_by,
        inst_cd=inst_cd,
    )
    return await _read_editor_bundle_after_write(
        rules_service, service_code, inst_cd=inst_cd, row=row
    )


@router.post(
    "/{service_code}/generate-draft-from-source",
    response_model=ServiceRuleBundleRead,
    summary="Generate draft YAML from pasted source code (AI)",
)
async def generate_draft_from_source(
    service_code: str,
    payload: ServiceRuleGenerateFromSourceRequest,
    inst_cd: str = Depends(require_active_inst_cd),
    ai_service: ServiceRulesAiService = Depends(get_service_rules_ai_service),
    rules_service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    row = await ai_service.generate_draft_from_source(
        service_code=service_code,
        source_code=payload.source_code,
        source_version=payload.source_version,
        hints=payload.hints,
        created_by=payload.created_by,
        use_data_pool=payload.use_data_pool,
        use_swagger=payload.use_swagger,
        inst_cd=inst_cd,
    )
    return await _read_editor_bundle_after_write(
        rules_service, service_code, inst_cd=inst_cd, row=row
    )


@router.post(
    "/{service_code}/{bundle_id}/activate",
    response_model=ServiceRuleBundleRead,
    summary="Apply working draft to current (record applied snapshot in history)",
)
async def activate_bundle(
    service_code: str,
    bundle_id: int,
    payload: ServiceRuleActivateRequest | None = None,
    inst_cd: str = Depends(require_active_inst_cd),
    service: ServiceRulesService = Depends(get_service_rules_service),
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> ServiceRuleBundleRead:
    code = (service_code or "").strip()
    if payload is not None and payload.auto_materialize_missing:
        await testcase_service.materialize_missing_draft_cases(code, inst_cd=inst_cd)
    row = await service.activate(bundle_id, inst_cd=inst_cd)
    if row.service_code != code:
        raise InvalidInputError("service_code mismatch")
    bundle = await _read_editor_bundle(service, service_code, inst_cd=inst_cd)
    if bundle is not None:
        return bundle
    return _to_read_current(row, prefer_draft=False)


@router.post(
    "/{service_code}/rollback",
    response_model=ServiceRuleBundleRead,
    summary="Restore applied YAML from a history snapshot",
)
async def rollback(
    service_code: str,
    payload: ServiceRuleRollbackRequest,
    inst_cd: str = Depends(require_active_inst_cd),
    service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRuleBundleRead:
    row = await service.rollback(
        service_code=service_code,
        to_version=payload.to_version,
        inst_cd=inst_cd,
    )
    bundle = await _read_editor_bundle(service, service_code, inst_cd=inst_cd)
    if bundle is not None:
        return bundle
    return _to_read_current(row, prefer_draft=False)

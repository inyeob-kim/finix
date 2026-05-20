"""API endpoints for DB-backed service catalog."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Query

from app.core.deps import get_service_catalog_service
from app.schemas.service_catalog_schema import (
    ServiceCatalogImportResult,
    ServiceCatalogItemRead,
)
from app.services.service_catalog_service import ServiceCatalogService

router = APIRouter(prefix="/service-catalog")


def _to_read(entity) -> ServiceCatalogItemRead:
    return ServiceCatalogItemRead(
        service_code=entity.service_code,
        service_name=entity.service_name,
        http_method=entity.http_method,
        uri=entity.uri,
        source=entity.source,
        source_version=entity.source_version,
        created_at=getattr(entity, "created_at", None),
        updated_at=getattr(entity, "updated_at", None),
    )


@router.get("", response_model=list[ServiceCatalogItemRead], summary="List service catalog")
async def list_service_catalog(
    query: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    service: ServiceCatalogService = Depends(get_service_catalog_service),
) -> list[ServiceCatalogItemRead]:
    rows = await service.list(query=query, limit=limit, offset=offset)
    return [_to_read(r) for r in rows]


@router.post(
    "/import",
    response_model=ServiceCatalogImportResult,
    summary="Import service catalog from cbs_srvc.json",
)
async def import_service_catalog(
    service: ServiceCatalogService = Depends(get_service_catalog_service),
) -> ServiceCatalogImportResult:
    result = await service.import_from_cbs_json()
    return ServiceCatalogImportResult(**result)


@router.post(
    "/import-json",
    response_model=ServiceCatalogImportResult,
    summary="Import service catalog from JSON body (UI)",
)
async def import_service_catalog_json(
    payload: Any = Body(...),
    service: ServiceCatalogService = Depends(get_service_catalog_service),
) -> ServiceCatalogImportResult:
    """Accept CBS-shaped JSON (array or wrapper object) from browser upload/paste."""
    result = await service.import_from_json_payload(payload)
    return ServiceCatalogImportResult(**result)


@router.get(
    "/{service_code}",
    response_model=ServiceCatalogItemRead | None,
    summary="Get one service by code",
)
async def get_service_catalog_item(
    service_code: str,
    service: ServiceCatalogService = Depends(get_service_catalog_service),
) -> ServiceCatalogItemRead | None:
    row = await service.get(service_code)
    return _to_read(row) if row else None

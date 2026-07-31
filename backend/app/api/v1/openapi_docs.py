"""API: OpenAPI / Swagger document ingest and operation listing."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Query

from app.core.deps import get_openapi_ingest_service
from app.schemas.data_pool_schema import (
    ApiOperationRead,
    OpenApiDocumentRead,
    OpenApiImportResult,
)
from app.services.openapi_ingest_service import OpenApiIngestService

router = APIRouter(prefix="/openapi")


@router.post(
    "/import",
    response_model=OpenApiImportResult,
    summary="Import OpenAPI/Swagger JSON",
)
async def import_openapi(
    payload: Any = Body(...),
    name: str | None = Query(default=None),
    service: OpenApiIngestService = Depends(get_openapi_ingest_service),
) -> OpenApiImportResult:
    # Allow { name, document } wrapper from UI
    doc = payload
    doc_name = name
    if isinstance(payload, dict) and "document" in payload:
        doc = payload.get("document")
        if not doc_name and payload.get("name"):
            doc_name = str(payload["name"])
    result = await service.import_document(doc, name=doc_name)
    return OpenApiImportResult(**result)


@router.get(
    "/documents",
    response_model=list[OpenApiDocumentRead],
    summary="List imported OpenAPI documents",
)
async def list_openapi_documents(
    service: OpenApiIngestService = Depends(get_openapi_ingest_service),
) -> list[OpenApiDocumentRead]:
    rows = await service.list_documents()
    return [OpenApiDocumentRead(**r) for r in rows]


@router.get(
    "/operations",
    response_model=list[ApiOperationRead],
    summary="List normalized API operations",
)
async def list_api_operations(
    query: str | None = Query(default=None),
    service_code: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    service: OpenApiIngestService = Depends(get_openapi_ingest_service),
) -> list[ApiOperationRead]:
    rows = await service.list_operations(
        query=query,
        service_code=service_code,
        limit=limit,
        offset=offset,
    )
    return [
        ApiOperationRead(
            id=r.id,
            openapi_document_id=r.openapi_document_id,
            service_code=r.service_code,
            method=r.method,
            path=r.path,
            operation_id=r.operation_id,
            summary=r.summary,
            created_at=r.created_at,
        )
        for r in rows
    ]

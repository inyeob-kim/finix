"""Import OpenAPI / Swagger JSON into api_operations."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.core.exceptions import InvalidInputError
from app.core.logger import get_logger
from app.domain.service_uri_match import extract_service_path, match_service_code
from app.models.fnx_openapi_document import ApiOperation, OpenApiDocument
from app.repositories.openapi_repo import OpenApiRepository
from app.repositories.service_catalog_repo import ServiceCatalogRepository
from app.utils.json_text import dumps_json

logger = get_logger(__name__)


def _checksum(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _match_service_code(
    *,
    path: str,
    operation_id: str | None,
    catalog_uris: dict[str, str],
) -> str | None:
    """Map operation to catalog service_code by URI suffix or operationId."""
    return match_service_code(
        path=extract_service_path(path) or path,
        catalog_uris=catalog_uris,
        operation_id=operation_id,
    )


def _iter_operations(doc: dict[str, Any]) -> list[dict[str, Any]]:
    paths = doc.get("paths")
    if not isinstance(paths, dict):
        return []
    out: list[dict[str, Any]] = []
    for path, item in paths.items():
        if not isinstance(item, dict):
            continue
        for method, op in item.items():
            m = str(method).lower()
            if m not in {"get", "post", "put", "patch", "delete", "head", "options"}:
                continue
            if not isinstance(op, dict):
                op = {}
            out.append(
                {
                    "method": m.upper(),
                    "path": str(path),
                    "operation_id": op.get("operationId"),
                    "summary": op.get("summary") or op.get("description"),
                    "request_schema": op.get("requestBody"),
                    "responses": op.get("responses"),
                },
            )
    return out


class OpenApiIngestService:
    """Parse OpenAPI 3.x (or Swagger-like paths map) into DB operations."""

    def __init__(
        self,
        openapi_repo: OpenApiRepository,
        catalog_repo: ServiceCatalogRepository,
    ) -> None:
        self._openapi = openapi_repo
        self._catalog = catalog_repo

    async def import_document(self, payload: Any, *, name: str | None = None) -> dict[str, Any]:
        if isinstance(payload, str):
            raw_text = payload
            try:
                doc = json.loads(payload)
            except json.JSONDecodeError as exc:
                raise InvalidInputError("OpenAPI JSON 파싱에 실패했습니다.") from exc
        elif isinstance(payload, dict):
            doc = payload
            raw_text = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        else:
            raise InvalidInputError("OpenAPI 본문은 JSON 객체여야 합니다.")

        if not isinstance(doc.get("paths"), dict):
            raise InvalidInputError("OpenAPI 문서에 paths 객체가 필요합니다.")

        checksum = _checksum(raw_text)
        existing = await self._openapi.get_document_by_checksum(checksum)
        info = doc.get("info") if isinstance(doc.get("info"), dict) else {}
        doc_name = (name or info.get("title") or "OpenAPI").strip() or "OpenAPI"
        version = str(info.get("version")) if info.get("version") is not None else None

        if existing is not None:
            document = existing
            reused = True
        else:
            document = await self._openapi.add_document(
                OpenApiDocument(
                    name=doc_name,
                    version=version,
                    raw_json=raw_text,
                    checksum=checksum,
                ),
            )
            reused = False

        catalog_rows = await self._catalog.list(query=None, limit=5000, offset=0)
        catalog_uris = {r.service_code: r.uri for r in catalog_rows if r.service_code}

        upserted = 0
        for op in _iter_operations(doc):
            code = _match_service_code(
                path=op["path"],
                operation_id=op.get("operation_id"),
                catalog_uris=catalog_uris,
            )
            await self._openapi.upsert_operation(
                ApiOperation(
                    openapi_document_id=document.id,
                    service_code=code,
                    method=op["method"],
                    path=op["path"],
                    operation_id=op.get("operation_id"),
                    summary=str(op["summary"])[:512] if op.get("summary") else None,
                    request_schema_json=(
                        dumps_json(op["request_schema"]) if op.get("request_schema") else None
                    ),
                    response_schema_json=(
                        dumps_json(op["responses"]) if op.get("responses") else None
                    ),
                ),
            )
            upserted += 1

        logger.info(
            "OpenAPI imported",
            extra={"document_id": document.id, "operations": upserted, "reused": reused},
        )
        return {
            "document_id": document.id,
            "name": document.name,
            "version": document.version,
            "operations_upserted": upserted,
            "checksum": document.checksum,
            "reused_document": reused,
        }

    async def list_operations(
        self,
        *,
        query: str | None = None,
        service_code: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[ApiOperation]:
        return await self._openapi.list_operations(
            query=query,
            service_code=service_code,
            limit=limit,
            offset=offset,
        )

    async def list_documents(self) -> list[dict[str, Any]]:
        docs = await self._openapi.list_documents()
        # operation_count is approximate via total ops when single doc workflow
        total_ops = await self._openapi.count_operations()
        return [
            {
                "id": d.id,
                "name": d.name,
                "version": d.version,
                "checksum": d.checksum,
                "imported_at": d.imported_at,
                "operation_count": total_ops if len(docs) == 1 else 0,
            }
            for d in docs
        ]

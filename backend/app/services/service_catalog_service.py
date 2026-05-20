"""Business logic for importing and serving the service catalog."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from app.core.exceptions import InvalidInputError
from app.models.service_catalog_item import ServiceCatalogItem
from app.repositories.cbs_service_catalog_repo import (
    CbsServiceRecord,
    extract_raw_catalog_dicts,
    raw_rows_to_cbs_records,
)
from app.repositories.service_catalog_repo import ServiceCatalogRepository


def _file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


class ServiceCatalogService:
    """Catalog import + query wrapper."""

    def __init__(
        self,
        *,
        catalog_repo: ServiceCatalogRepository,
        cbs_json_repo: CbsServiceCatalogRepository,
    ) -> None:
        self._repo = catalog_repo
        self._cbs = cbs_json_repo

    async def _upsert_records(
        self,
        rows: list[CbsServiceRecord],
        *,
        source: str,
        source_version: str | None,
    ) -> int:
        upserted = 0
        for r in rows:
            raw_json = json.dumps(asdict(r), ensure_ascii=False)
            item = ServiceCatalogItem(
                service_code=r.service_code,
                service_name=r.service_name or "",
                http_method=r.http_method or "",
                uri=r.uri or "",
                tags_json=None,
                raw_json=raw_json,
                source=source,
                source_version=source_version,
            )
            await self._repo.upsert(item)
            upserted += 1
        return upserted

    async def import_from_cbs_json(self) -> dict:
        """
        Import records from `cbs_srvc.json` into DB (idempotent).

        Returns a small summary used by API.
        """
        path = Path(self._cbs._json_path)  # noqa: SLF001 - centralize later
        source_version = _file_sha256(path) if path.exists() else None

        rows = await self._cbs.search_by_prompt("", limit=1000000)
        upserted = await self._upsert_records(
            rows, source="cbs_srvc.json", source_version=source_version
        )
        return {"source": "cbs_srvc.json", "source_version": source_version, "upserted": upserted}

    async def import_from_json_payload(self, payload: Any) -> dict:
        """Import catalog rows from a JSON list/object (UI upload / paste)."""
        if payload is None:
            raise InvalidInputError("JSON 본문이 비어 있습니다.")
        raw = extract_raw_catalog_dicts(payload)
        records = raw_rows_to_cbs_records(raw)
        if not records:
            raise InvalidInputError(
                "유효한 서비스 행이 없습니다. SRVC_CD(또는 service_code), HTTP 메서드·URI 필드를 확인하세요."
            )
        blob = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        source_version = hashlib.sha256(blob.encode("utf-8")).hexdigest()
        upserted = await self._upsert_records(
            records, source="catalog-upload", source_version=source_version
        )
        return {"source": "catalog-upload", "source_version": source_version, "upserted": upserted}

    async def list(self, *, query: str | None, limit: int, offset: int) -> list[ServiceCatalogItem]:
        return await self._repo.list(query=query, limit=limit, offset=offset)

    async def get(self, service_code: str) -> ServiceCatalogItem | None:
        return await self._repo.get_by_service_code(service_code)


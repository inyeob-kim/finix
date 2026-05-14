"""Business logic for importing and serving the service catalog."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from app.models.service_catalog_item import ServiceCatalogItem
from app.repositories.cbs_service_catalog_repo import CbsServiceCatalogRepository
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

    async def import_from_cbs_json(self) -> dict:
        """
        Import records from `cbs_srvc.json` into DB (idempotent).

        Returns a small summary used by API.
        """
        path = Path(self._cbs._json_path)  # noqa: SLF001 - centralize later
        source_version = _file_sha256(path) if path.exists() else None

        rows = await self._cbs.search_by_prompt("", limit=1000000)
        upserted = 0
        for r in rows:
            raw_json = json.dumps(r.__dict__, ensure_ascii=False)
            item = ServiceCatalogItem(
                service_code=r.service_code,
                service_name=r.service_name or "",
                http_method=r.http_method or "",
                uri=r.uri or "",
                tags_json=None,
                raw_json=raw_json,
                source="cbs_srvc.json",
                source_version=source_version,
            )
            await self._repo.upsert(item)
            upserted += 1
        return {"source": "cbs_srvc.json", "source_version": source_version, "upserted": upserted}

    async def list(self, *, query: str | None, limit: int, offset: int) -> list[ServiceCatalogItem]:
        return await self._repo.list(query=query, limit=limit, offset=offset)

    async def get(self, service_code: str) -> ServiceCatalogItem | None:
        return await self._repo.get_by_service_code(service_code)


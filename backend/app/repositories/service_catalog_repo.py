"""Async DB repository for service catalog items."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service_catalog_item import ServiceCatalogItem


class ServiceCatalogRepository:
    """CRUD access for service catalog items in DB."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(self, item: ServiceCatalogItem) -> ServiceCatalogItem:
        """
        Upsert by unique service_code.

        We implement as read-then-update to stay dialect-agnostic.
        """
        existing = await self.get_by_service_code(item.service_code)
        if existing is None:
            self._session.add(item)
            await self._session.flush()
            await self._session.refresh(item)
            return item

        existing.service_name = item.service_name
        existing.http_method = item.http_method
        existing.uri = item.uri
        existing.tags_json = item.tags_json
        existing.raw_json = item.raw_json
        existing.source = item.source
        existing.source_version = item.source_version
        await self._session.flush()
        await self._session.refresh(existing)
        return existing

    async def get_by_service_code(self, service_code: str) -> ServiceCatalogItem | None:
        code = (service_code or "").strip()
        if not code:
            return None
        res = await self._session.execute(
            select(ServiceCatalogItem).where(ServiceCatalogItem.service_code == code)
        )
        return res.scalar_one_or_none()

    async def list(
        self, *, query: str | None = None, limit: int = 50, offset: int = 0
    ) -> list[ServiceCatalogItem]:
        stmt = select(ServiceCatalogItem)
        q = (query or "").strip()
        if q:
            like = f"%{q}%"
            stmt = stmt.where(
                (ServiceCatalogItem.service_code.ilike(like))
                | (ServiceCatalogItem.service_name.ilike(like))
                | (ServiceCatalogItem.uri.ilike(like))
            )
        stmt = stmt.order_by(ServiceCatalogItem.service_code.asc()).offset(offset).limit(limit)
        return list((await self._session.execute(stmt)).scalars().all())

    async def delete_all(self, *, source: str | None = None) -> int:
        stmt = delete(ServiceCatalogItem)
        if source:
            stmt = stmt.where(ServiceCatalogItem.source == source)
        res = await self._session.execute(stmt)
        return res.rowcount or 0


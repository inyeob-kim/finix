"""Async DB repository for versioned service rules (DB primary)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service_rule_bundle import ServiceRuleBundle
from app.models.service_rule_pointer import ServiceRulePointer


class ServiceRulesRepository:
    """Data access for service rule bundles and pointers."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_bundle(self, bundle_id: int) -> ServiceRuleBundle | None:
        res = await self._session.execute(
            select(ServiceRuleBundle).where(ServiceRuleBundle.id == bundle_id)
        )
        return res.scalar_one_or_none()

    async def get_bundle_by_version(
        self, *, service_code: str, version: int
    ) -> ServiceRuleBundle | None:
        code = (service_code or "").strip()
        if not code:
            return None
        res = await self._session.execute(
            select(ServiceRuleBundle).where(
                (ServiceRuleBundle.service_code == code)
                & (ServiceRuleBundle.version == version)
            )
        )
        return res.scalar_one_or_none()

    async def list_versions(self, service_code: str) -> list[ServiceRuleBundle]:
        code = (service_code or "").strip()
        if not code:
            return []
        stmt = (
            select(ServiceRuleBundle)
            .where(ServiceRuleBundle.service_code == code)
            .order_by(ServiceRuleBundle.version.desc())
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def next_version(self, service_code: str) -> int:
        code = (service_code or "").strip()
        if not code:
            return 1
        res = await self._session.execute(
            select(func.max(ServiceRuleBundle.version)).where(ServiceRuleBundle.service_code == code)
        )
        current = res.scalar_one()
        return int(current or 0) + 1

    async def create_bundle(self, bundle: ServiceRuleBundle) -> ServiceRuleBundle:
        self._session.add(bundle)
        await self._session.flush()
        await self._session.refresh(bundle)
        return bundle

    async def flush_bundle(self, bundle: ServiceRuleBundle) -> ServiceRuleBundle:
        await self._session.flush()
        await self._session.refresh(bundle)
        return bundle

    async def get_pointer(self, service_code: str) -> ServiceRulePointer | None:
        code = (service_code or "").strip()
        if not code:
            return None
        res = await self._session.execute(
            select(ServiceRulePointer).where(ServiceRulePointer.service_code == code)
        )
        return res.scalar_one_or_none()

    async def ensure_pointer(self, service_code: str) -> ServiceRulePointer:
        code = (service_code or "").strip()
        ptr = await self.get_pointer(code)
        if ptr is not None:
            return ptr
        ptr = ServiceRulePointer(service_code=code, active_bundle_id=None, approved_bundle_id=None)
        self._session.add(ptr)
        await self._session.flush()
        await self._session.refresh(ptr)
        return ptr

    async def set_approved(self, service_code: str, bundle_id: int | None) -> ServiceRulePointer:
        ptr = await self.ensure_pointer(service_code)
        ptr.approved_bundle_id = bundle_id
        await self._session.flush()
        await self._session.refresh(ptr)
        return ptr

    async def set_active(self, service_code: str, bundle_id: int | None) -> ServiceRulePointer:
        ptr = await self.ensure_pointer(service_code)
        ptr.active_bundle_id = bundle_id
        await self._session.flush()
        await self._session.refresh(ptr)
        return ptr

    async def list_all_bundles(
        self,
        *,
        limit: int = 500,
        offset: int = 0,
    ) -> list[ServiceRuleBundle]:
        stmt = (
            select(ServiceRuleBundle)
            .order_by(
                ServiceRuleBundle.service_code.asc(),
                ServiceRuleBundle.version.desc(),
            )
            .offset(offset)
            .limit(limit)
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def list_all_pointers(self) -> list[ServiceRulePointer]:
        return list((await self._session.execute(select(ServiceRulePointer))).scalars().all())

    async def count_distinct_services(self) -> int:
        res = await self._session.execute(
            select(func.count(func.distinct(ServiceRuleBundle.service_code)))
        )
        return int(res.scalar_one() or 0)

    async def delete_bundle(self, bundle_id: int) -> bool:
        bundle = await self.get_bundle(bundle_id)
        if bundle is None:
            return False
        ptr = await self.get_pointer(bundle.service_code)
        if ptr is not None:
            if ptr.active_bundle_id == bundle_id:
                ptr.active_bundle_id = None
            if ptr.approved_bundle_id == bundle_id:
                ptr.approved_bundle_id = None
            await self._session.flush()
        await self._session.delete(bundle)
        await self._session.flush()
        return True

    async def get_active_bundle(self, service_code: str) -> ServiceRuleBundle | None:
        code = (service_code or "").strip()
        if not code:
            return None
        stmt = (
            select(ServiceRuleBundle)
            .join(ServiceRulePointer, ServiceRulePointer.active_bundle_id == ServiceRuleBundle.id)
            .where(ServiceRulePointer.service_code == code)
        )
        res = await self._session.execute(stmt)
        return res.scalar_one_or_none()


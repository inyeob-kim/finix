"""Async DB repository for current YAML + history snapshots."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.inst_scope import DEFAULT_INST_CD, require_inst_cd
from app.models.fnx_rule_doc_current import ServiceRuleCurrent
from app.models.fnx_rule_doc_hist import ServiceRuleHistory


class ServiceRulesRepository:
    """Data access for applied rules and history."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_current(
        self, service_code: str, *, inst_cd: str | None = None
    ) -> ServiceRuleCurrent | None:
        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd or DEFAULT_INST_CD)
        if not code:
            return None
        res = await self._session.execute(
            select(ServiceRuleCurrent).where(
                ServiceRuleCurrent.inst_cd == inst,
                ServiceRuleCurrent.service_code == code,
            )
        )
        return res.scalar_one_or_none()

    async def get_current_by_id(self, current_id: int) -> ServiceRuleCurrent | None:
        res = await self._session.execute(
            select(ServiceRuleCurrent).where(ServiceRuleCurrent.id == current_id)
        )
        return res.scalar_one_or_none()

    async def list_all_current(
        self, *, limit: int = 5000, offset: int = 0, inst_cd: str | None = None
    ) -> list[ServiceRuleCurrent]:
        inst = require_inst_cd(inst_cd or DEFAULT_INST_CD)
        stmt = (
            select(ServiceRuleCurrent)
            .where(ServiceRuleCurrent.inst_cd == inst)
            .order_by(ServiceRuleCurrent.service_code.asc())
            .offset(offset)
            .limit(limit)
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def ensure_current(
        self, service_code: str, *, inst_cd: str | None = None
    ) -> ServiceRuleCurrent:
        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd or DEFAULT_INST_CD)
        row = await self.get_current(code, inst_cd=inst)
        if row is not None:
            return row
        row = ServiceRuleCurrent(
            inst_cd=inst,
            service_code=code,
            yaml_text="",
            checksum="",
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return row

    async def flush_current(self, row: ServiceRuleCurrent) -> ServiceRuleCurrent:
        await self._session.flush()
        await self._session.refresh(row)
        return row

    async def count_services(self) -> int:
        res = await self._session.execute(select(func.count()).select_from(ServiceRuleCurrent))
        return int(res.scalar_one() or 0)

    async def add_history(self, row: ServiceRuleHistory) -> ServiceRuleHistory:
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return row

    async def get_history(self, history_id: int) -> ServiceRuleHistory | None:
        res = await self._session.execute(
            select(ServiceRuleHistory).where(ServiceRuleHistory.id == history_id)
        )
        return res.scalar_one_or_none()

    async def list_history(
        self, service_code: str, *, inst_cd: str | None = None
    ) -> list[ServiceRuleHistory]:
        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd or DEFAULT_INST_CD)
        if not code:
            return []
        stmt = (
            select(ServiceRuleHistory)
            .where(
                ServiceRuleHistory.inst_cd == inst,
                ServiceRuleHistory.service_code == code,
            )
            .order_by(ServiceRuleHistory.created_at.desc(), ServiceRuleHistory.id.desc())
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def count_history(
        self, service_code: str, *, inst_cd: str | None = None
    ) -> int:
        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd or DEFAULT_INST_CD)
        if not code:
            return 0
        res = await self._session.execute(
            select(func.count())
            .select_from(ServiceRuleHistory)
            .where(
                ServiceRuleHistory.inst_cd == inst,
                ServiceRuleHistory.service_code == code,
            )
        )
        return int(res.scalar_one() or 0)

    async def delete_history(self, history_id: int) -> bool:
        row = await self.get_history(history_id)
        if row is None:
            return False
        await self._session.delete(row)
        await self._session.flush()
        return True

    async def find_history_by_checksum(
        self,
        *,
        service_code: str,
        checksum: str,
        inst_cd: str | None = None,
    ) -> ServiceRuleHistory | None:
        code = (service_code or "").strip()
        cs = (checksum or "").strip()
        inst = require_inst_cd(inst_cd or DEFAULT_INST_CD)
        if not code or not cs:
            return None
        stmt = (
            select(ServiceRuleHistory)
            .where(
                ServiceRuleHistory.inst_cd == inst,
                ServiceRuleHistory.service_code == code,
                ServiceRuleHistory.checksum == cs,
            )
            .order_by(ServiceRuleHistory.created_at.desc(), ServiceRuleHistory.id.desc())
            .limit(1)
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()

    # --- Compatibility aliases used during transition ---

    async def get_active_bundle(
        self, service_code: str, *, inst_cd: str | None = None
    ) -> ServiceRuleCurrent | None:
        """Return current row only when applied YAML is present."""
        row = await self.get_current(service_code, inst_cd=inst_cd)
        if row is None or not row.has_applied:
            return None
        return row

    async def list_versions(
        self, service_code: str, *, inst_cd: str | None = None
    ) -> list[ServiceRuleHistory]:
        return await self.list_history(service_code, inst_cd=inst_cd)

"""Repository for fnx_inst institution master."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fnx_inst import FnxInst


class InstitutionRepository:
    """Data access for institutions."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, inst_cd: str) -> FnxInst | None:
        code = (inst_cd or "").strip()
        if not code:
            return None
        stmt = select(FnxInst).where(FnxInst.inst_cd == code)
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def list_active(self) -> list[FnxInst]:
        stmt = (
            select(FnxInst)
            .where(FnxInst.is_active.is_(True))
            .order_by(FnxInst.inst_cd.asc())
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def list_all(self) -> list[FnxInst]:
        stmt = select(FnxInst).order_by(FnxInst.inst_cd.asc())
        return list((await self._session.execute(stmt)).scalars().all())

    async def create(
        self,
        *,
        inst_cd: str,
        inst_nm: str,
        is_active: bool = True,
        remark: str | None = None,
    ) -> FnxInst:
        row = FnxInst(
            inst_cd=inst_cd.strip(),
            inst_nm=inst_nm.strip(),
            is_active=is_active,
            remark=(remark.strip() if remark else None),
        )
        self._session.add(row)
        await self._session.flush()
        return row

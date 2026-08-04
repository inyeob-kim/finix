"""Repository for collection_var_generators."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection_var_generator import CollectionVarGenerator


class CollectionVarGeneratorRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_active(self) -> list[CollectionVarGenerator]:
        stmt = (
            select(CollectionVarGenerator)
            .where(CollectionVarGenerator.status == "active")
            .order_by(CollectionVarGenerator.label.asc(), CollectionVarGenerator.id.asc())
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def list_all(self, *, limit: int = 200) -> list[CollectionVarGenerator]:
        stmt = (
            select(CollectionVarGenerator)
            .order_by(CollectionVarGenerator.created_at.desc())
            .limit(limit)
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def get_by_key(self, key: str) -> CollectionVarGenerator | None:
        stmt = select(CollectionVarGenerator).where(
            CollectionVarGenerator.key == key.strip(),
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def create(self, row: CollectionVarGenerator) -> CollectionVarGenerator:
        self._session.add(row)
        await self._session.flush()
        return row

    async def save(self, row: CollectionVarGenerator) -> CollectionVarGenerator:
        await self._session.flush()
        return row

    async def deactivate(self, key: str) -> CollectionVarGenerator | None:
        row = await self.get_by_key(key)
        if row is None:
            return None
        row.status = "inactive"
        await self._session.flush()
        return row

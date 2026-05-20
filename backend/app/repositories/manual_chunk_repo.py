"""Repository for manual RAG chunks."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.manual_chunk import ManualChunk, ManualIndexMeta


class ManualChunkRepository:
    """Data access for manual index and chunks."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_latest_meta(self) -> ManualIndexMeta | None:
        stmt = select(ManualIndexMeta).order_by(ManualIndexMeta.id.desc()).limit(1)
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def replace_index(
        self,
        *,
        source_checksum: str,
        source_path: str,
        chunks: list[ManualChunk],
    ) -> ManualIndexMeta:
        await self._session.execute(delete(ManualChunk))
        await self._session.execute(delete(ManualIndexMeta))
        for row in chunks:
            self._session.add(row)
        meta = ManualIndexMeta(
            source_checksum=source_checksum,
            chunk_count=len(chunks),
            source_path=source_path,
        )
        self._session.add(meta)
        await self._session.flush()
        await self._session.refresh(meta)
        return meta

    async def list_chunks_for_checksum(self, checksum: str) -> list[ManualChunk]:
        stmt = (
            select(ManualChunk)
            .where(ManualChunk.source_checksum == checksum)
            .order_by(ManualChunk.chunk_index.asc())
        )
        return list((await self._session.execute(stmt)).scalars().all())

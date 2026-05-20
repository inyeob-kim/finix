#!/usr/bin/env python3
"""Reindex FINIX manual markdown for RAG (run after doc updates)."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


async def main() -> None:
    from app.core.config import get_settings
    from app.core.deps import get_llm_client
    from app.db.session import get_session_factory
    from app.repositories.manual_chunk_repo import ManualChunkRepository
    from app.services.manual_rag_service import ManualRagService

    settings = get_settings()
    llm = get_llm_client()
    if llm is None:
        print("ERROR: LLM_API_KEY is not set", file=sys.stderr)
        sys.exit(1)

    factory = get_session_factory()
    async with factory() as session:
        repo = ManualChunkRepository(session)
        svc = ManualRagService(
            repo=repo,
            llm=llm,
            manual_path=settings.manual_md_path,
            manual_docs_dir=settings.manual_docs_dir,
            embedding_model=settings.llm_embedding_model,
        )
        result = await svc.ensure_indexed(force=True)
        await session.commit()
    print(
        f"Reindexed: {result['chunk_count']} chunks, "
        f"checksum={result.get('source_checksum', '')[:12]}..."
    )


if __name__ == "__main__":
    asyncio.run(main())

"""Manual RAG: header chunking, embedding index, chat retrieval."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

from app.core.exceptions import InvalidInputError
from app.core.logger import get_logger
from app.integrations.llm_client import LlmClient
from app.manual.loader import load_manual_chunks
from app.models.manual_chunk import ManualChunk
from app.prompts.manual_chat_prompt import (
    build_manual_system_prompt,
    build_manual_user_prompt,
)
from app.repositories.manual_chunk_repo import ManualChunkRepository

logger = get_logger(__name__)

_EMBED_BATCH = 32
_TOP_K = 8


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class ManualRagService:
    """Index FINIX manual markdown and answer questions via RAG."""

    def __init__(
        self,
        *,
        repo: ManualChunkRepository,
        llm: LlmClient,
        manual_path: str,
        manual_docs_dir: str | None,
        embedding_model: str,
    ) -> None:
        self._repo = repo
        self._llm = llm
        self._manual_path = manual_path
        self._manual_docs_dir = manual_docs_dir
        self._embedding_model = embedding_model

    def _load_corpus(self):
        try:
            return load_manual_chunks(
                main_path=self._manual_path,
                docs_dir=self._manual_docs_dir,
            )
        except FileNotFoundError as e:
            raise InvalidInputError(str(e)) from e

    async def ensure_indexed(self, *, force: bool = False) -> dict[str, Any]:
        """Build or refresh chunk embeddings when source checksum changes."""
        docs, checksum, source_summary = self._load_corpus()
        meta = await self._repo.get_latest_meta()
        if not force and meta is not None and meta.source_checksum == checksum:
            return {
                "indexed": True,
                "chunk_count": meta.chunk_count,
                "source_checksum": meta.source_checksum,
                "source_path": meta.source_path,
                "reindexed": False,
            }

        if not docs:
            raise InvalidInputError("매뉴얼에서 chunk를 만들 수 없습니다.")

        embed_inputs = [
            f"[{d.header_path}]\n{d.content}" for d in docs
        ]
        all_vectors: list[list[float]] = []
        for i in range(0, len(embed_inputs), _EMBED_BATCH):
            batch = embed_inputs[i : i + _EMBED_BATCH]
            vectors = await self._llm.embed_texts(
                batch,
                model=self._embedding_model,
            )
            all_vectors.extend(vectors)

        rows: list[ManualChunk] = []
        for doc, vector in zip(docs, all_vectors, strict=True):
            rows.append(
                ManualChunk(
                    source_checksum=checksum,
                    header_path=doc.header_path,
                    content=doc.content,
                    chunk_index=doc.chunk_index,
                    embedding_json=json.dumps(vector),
                )
            )

        meta = await self._repo.replace_index(
            source_checksum=checksum,
            source_path=source_summary,
            chunks=rows,
        )
        logger.info(
            "Manual RAG indexed",
            extra={"chunk_count": meta.chunk_count, "checksum": checksum},
        )
        return {
            "indexed": True,
            "chunk_count": meta.chunk_count,
            "source_checksum": meta.source_checksum,
            "source_path": meta.source_path,
            "reindexed": True,
        }

    async def status(self) -> dict[str, Any]:
        meta = await self._repo.get_latest_meta()
        if meta is None:
            return {
                "indexed": False,
                "chunk_count": 0,
                "source_checksum": None,
                "source_path": self._manual_path,
            }
        return {
            "indexed": True,
            "chunk_count": meta.chunk_count,
            "source_checksum": meta.source_checksum,
            "source_path": meta.source_path,
        }

    async def _retrieve(self, query: str, *, top_k: int = _TOP_K) -> list[ManualChunk]:
        meta = await self._repo.get_latest_meta()
        if meta is None:
            await self.ensure_indexed()
            meta = await self._repo.get_latest_meta()
        if meta is None:
            return []

        query_vec = (
            await self._llm.embed_texts([query], model=self._embedding_model)
        )[0]
        chunks = await self._repo.list_chunks_for_checksum(meta.source_checksum)
        scored: list[tuple[float, ManualChunk]] = []
        for ch in chunks:
            vec = json.loads(ch.embedding_json or "[]")
            score = _cosine_similarity(query_vec, vec)
            scored.append((score, ch))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [ch for _, ch in scored[:top_k]]

    async def chat(
        self,
        *,
        message: str,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        question = (message or "").strip()
        if not question:
            raise InvalidInputError("message가 필요합니다.")

        await self.ensure_indexed()
        hits = await self._retrieve(question)
        context_blocks = [
            f"## {ch.header_path}\n{ch.content}" for ch in hits
        ]
        if not context_blocks:
            context_blocks = ["(no matching manual sections)"]

        system = build_manual_system_prompt()
        user_prompt = build_manual_user_prompt(
            question=question,
            context_blocks=context_blocks,
        )

        # Include short history in user prompt for multi-turn context.
        history_text = ""
        if history:
            lines: list[str] = []
            for turn in history[-6:]:
                role = turn.get("role", "user")
                content = str(turn.get("content", "")).strip()
                if content:
                    lines.append(f"{role}: {content}")
            if lines:
                history_text = "Recent conversation:\n" + "\n".join(lines) + "\n\n"

        answer = await self._llm.complete_text(
            system_prompt=system,
            user_prompt=history_text + user_prompt,
            temperature=0.2,
        )

        return {
            "answer": answer,
            "sources": [
                {
                    "header_path": ch.header_path,
                    "chunk_index": ch.chunk_index,
                    "preview": ch.content[:240],
                }
                for ch in hits
            ],
        }

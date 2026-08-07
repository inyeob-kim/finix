"""RAG retrieval over collection-var generator catalog cards."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from app.domain.embedding_similarity import cosine_similarity
from app.integrations.llm_client import LlmClient

logger = logging.getLogger(__name__)

_EMBED_BATCH = 32
_DEFAULT_TOP_K = 8


def catalog_card_embed_text(card: dict[str, Any]) -> str:
    """Flatten a summarize_generator_for_ai card for embedding."""
    samples = card.get("samples") or []
    sample_txt = ", ".join(str(s) for s in samples[:8])
    impl = card.get("impl_summary")
    impl_txt = json.dumps(impl, ensure_ascii=False) if impl else ""
    parts = [
        f"key: {card.get('key') or ''}",
        f"label: {card.get('label') or ''}",
        f"returns: {card.get('returns') or ''}",
        f"kind: {card.get('impl_kind') or ''}",
        f"description: {card.get('description') or ''}",
        f"samples: {sample_txt}",
        f"impl: {impl_txt}",
    ]
    return "\n".join(p for p in parts if p.split(": ", 1)[-1].strip())


def assignment_query_text(row: dict[str, Any]) -> str:
    """Query text from a script set() assignment payload."""
    binds = row.get("related_bindings") or {}
    bind_lines = [
        f"{k} = {str(v)[:200]}"
        for k, v in list(binds.items())[:12]
    ]
    return "\n".join(
        [
            f"variable: {row.get('name') or ''}",
            f"rhs: {row.get('rhs') or row.get('evidence') or ''}",
            f"evidence: {row.get('evidence') or ''}",
            "related_bindings:",
            *bind_lines,
        ]
    )


@dataclass
class GeneratorCatalogIndex:
    """In-memory embedding index for one import / draft session."""

    cards: list[dict[str, Any]] = field(default_factory=list)
    vectors: list[list[float]] = field(default_factory=list)

    def __bool__(self) -> bool:
        return bool(self.cards) and len(self.cards) == len(self.vectors)


class CollectionVarGeneratorRagService:
    """Embed catalog cards and retrieve top-k by cosine similarity."""

    def __init__(
        self,
        *,
        embedding_llm: LlmClient | None,
        embedding_model: str,
        top_k: int = _DEFAULT_TOP_K,
    ) -> None:
        self._embedding_llm = embedding_llm
        self._embedding_model = embedding_model
        self._top_k = max(1, int(top_k))

    @property
    def available(self) -> bool:
        return self._embedding_llm is not None

    async def build_index(
        self,
        cards: list[dict[str, Any]],
    ) -> GeneratorCatalogIndex:
        if not cards or self._embedding_llm is None:
            return GeneratorCatalogIndex()
        texts = [catalog_card_embed_text(c) for c in cards]
        vectors = await self._embed_batched(texts)
        if len(vectors) != len(cards):
            logger.warning(
                "generator_rag index size mismatch cards=%s vectors=%s",
                len(cards),
                len(vectors),
            )
            return GeneratorCatalogIndex()
        return GeneratorCatalogIndex(cards=list(cards), vectors=vectors)

    async def retrieve_many(
        self,
        index: GeneratorCatalogIndex,
        queries: list[str],
        *,
        top_k: int | None = None,
    ) -> list[list[dict[str, Any]]]:
        """Return top-k catalog cards (with score) per query."""
        k = max(1, int(top_k or self._top_k))
        if not index or not queries or self._embedding_llm is None:
            return [[] for _ in queries]
        q_vecs = await self._embed_batched(queries)
        out: list[list[dict[str, Any]]] = []
        for qv in q_vecs:
            scored: list[tuple[float, dict[str, Any]]] = []
            for card, cv in zip(index.cards, index.vectors, strict=True):
                scored.append((cosine_similarity(qv, cv), card))
            scored.sort(key=lambda t: t[0], reverse=True)
            rows: list[dict[str, Any]] = []
            for score, card in scored[:k]:
                item = dict(card)
                item["similarity"] = round(float(score), 4)
                rows.append(item)
            out.append(rows)
        # Pad if embed batch returned fewer vectors
        while len(out) < len(queries):
            out.append([])
        return out[: len(queries)]

    async def attach_candidates(
        self,
        assignments: list[dict[str, Any]],
        cards: list[dict[str, Any]],
        *,
        top_k: int | None = None,
    ) -> list[dict[str, Any]]:
        """
        Copy assignments and set ``catalog_candidates`` via RAG.

        When embeddings are unavailable, each row gets the full card list
        (no similarity field) so the LLM still has a catalog.
        """
        if not assignments:
            return []
        # No embeddings: keep candidates empty; shared catalog goes in the LLM prompt once.
        if not self.available or not cards:
            return [{**row, "catalog_candidates": []} for row in assignments]
        try:
            index = await self.build_index(cards)
            queries = [assignment_query_text(row) for row in assignments]
            retrieved = await self.retrieve_many(index, queries, top_k=top_k)
        except Exception as exc:  # noqa: BLE001
            logger.warning("generator_rag retrieve failed: %s", exc)
            return [{**row, "catalog_candidates": []} for row in assignments]
        out: list[dict[str, Any]] = []
        for row, cands in zip(assignments, retrieved, strict=True):
            out.append({**row, "catalog_candidates": cands or []})
        return out

    async def _embed_batched(self, texts: list[str]) -> list[list[float]]:
        assert self._embedding_llm is not None
        all_vectors: list[list[float]] = []
        for i in range(0, len(texts), _EMBED_BATCH):
            batch = texts[i : i + _EMBED_BATCH]
            vectors = await self._embedding_llm.embed_texts(
                batch,
                model=self._embedding_model,
            )
            all_vectors.extend(vectors)
        return all_vectors

"""Slim helpers for Postman script → generator AI payloads."""

from __future__ import annotations

from typing import Any

_CARD_KEEP = (
    "key",
    "label",
    "returns",
    "impl_kind",
    "description",
    "samples",
    "impl_summary",
    "similarity",
    "source",
)


def slim_catalog_card(card: dict[str, Any], *, desc_limit: int = 180) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in _CARD_KEEP:
        if key not in card:
            continue
        val = card[key]
        if val is None or val == "" or val == [] or val == {}:
            continue
        if key == "description" and isinstance(val, str):
            out[key] = val[:desc_limit]
        elif key == "samples" and isinstance(val, list):
            out[key] = [str(v) for v in val[:6]]
        else:
            out[key] = val
    return out


def slim_assignment_for_llm(row: dict[str, Any]) -> dict[str, Any]:
    """Shrink one set() assignment for chat LLM (keep RAG candidates slim)."""
    binds = row.get("related_bindings") or {}
    slim_binds: dict[str, str] = {}
    if isinstance(binds, dict):
        for i, (k, v) in enumerate(binds.items()):
            if i >= 8:
                break
            slim_binds[str(k)] = str(v)[:160]
    cands = row.get("catalog_candidates") or []
    slim_cands = [
        slim_catalog_card(c)
        for c in cands[:8]
        if isinstance(c, dict)
    ]
    return {
        "name": row.get("name"),
        "source": str(row.get("source") or "")[:80],
        "rhs": str(row.get("rhs") or row.get("evidence") or "")[:350],
        "evidence": str(row.get("evidence") or "")[:220],
        "related_bindings": slim_binds,
        "catalog_candidates": slim_cands,
    }

"""Parse/persist scenario steps_json with optional Postman config envelope."""

from __future__ import annotations

from typing import Any

from app.domain.postman_collection_config import PostmanCollectionConfig
from app.utils.json_text import dumps_json, loads_json


def parse_steps_list(raw: Any) -> list[Any]:
    """Return step dict rows from legacy array or v2 envelope."""
    if isinstance(raw, dict):
        steps = raw.get("steps")
        return steps if isinstance(steps, list) else []
    if isinstance(raw, list):
        return raw
    return []


def parse_postman_config(raw: Any) -> PostmanCollectionConfig | None:
    """Extract Postman config from envelope; ``None`` when absent or empty."""
    if not isinstance(raw, dict):
        return None
    postman = raw.get("postman")
    if not isinstance(postman, dict):
        return None
    try:
        cfg = PostmanCollectionConfig.model_validate(postman)
    except Exception:
        return None
    return None if cfg.is_empty() else cfg


def parse_steps_document(
    steps_json: str | None,
) -> tuple[list[Any], PostmanCollectionConfig | None]:
    """Load steps list and optional Postman config from persisted JSON."""
    raw = loads_json(steps_json, [])
    return parse_steps_list(raw), parse_postman_config(raw)


def dump_steps_document(
    steps: list[Any],
    postman: PostmanCollectionConfig | None = None,
) -> str:
    """Serialize steps; wrap in envelope when Postman config is present."""
    if postman is None or postman.is_empty():
        return dumps_json(steps)
    return dumps_json(
        {
            "version": 2,
            "steps": steps,
            "postman": postman.model_dump(exclude_none=True),
        },
    )

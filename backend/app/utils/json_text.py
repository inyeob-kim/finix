"""JSON helpers for text columns (no I/O)."""

from __future__ import annotations

import json
from typing import Any


def dumps_json(data: Any) -> str:
    """Serialize value to compact JSON string."""
    return json.dumps(data, ensure_ascii=False)


def loads_json(text: str | None, default: Any) -> Any:
    """Parse JSON text, returning *default* on empty or invalid input."""
    if not text or not text.strip():
        return default
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return default

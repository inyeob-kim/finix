"""Collect dot paths from JSON-like skeleton trees for binding pickers."""

from __future__ import annotations

from typing import Any


def collect_dot_paths(
    value: Any,
    *,
    prefix: str = "",
    max_depth: int = 6,
    max_paths: int = 80,
) -> list[str]:
    """Return sorted unique dot paths (no ``$.`` prefix)."""
    out: list[str] = []

    def walk(cur: Any, path: str, depth: int) -> None:
        if len(out) >= max_paths or depth > max_depth:
            return
        if cur is None:
            if path:
                out.append(path)
            return
        if isinstance(cur, list):
            if path:
                out.append(path)
            for i, item in enumerate(cur[:3]):
                next_path = f"{path}.{i}" if path else str(i)
                walk(item, next_path, depth + 1)
            return
        if isinstance(cur, dict):
            keys = list(cur.keys())
            if not keys and path:
                out.append(path)
                return
            for key in keys:
                next_path = f"{path}.{key}" if path else str(key)
                walk(cur[key], next_path, depth + 1)
            return
        if path:
            out.append(path)

    walk(value, prefix, 0)
    return sorted(set(out))


def normalize_field_key(name: str) -> str:
    """Loose match for ``arrId`` vs ``arr_id``."""
    import re

    return re.sub(r"[_\s-]", "", (name or "").lower())


def path_leaf(path: str) -> str:
    raw = (path or "").strip()
    if raw.startswith("$."):
        raw = raw[2:]
    elif raw.startswith("$"):
        raw = raw[1:].lstrip(".")
    parts = [p for p in raw.split(".") if p]
    return parts[-1] if parts else raw

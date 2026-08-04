"""Declarative extract/inject between scenario steps (Postman-style context, no JS)."""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

from pydantic import BaseModel, Field

_PATH_SEGMENT = re.compile(r"[^.\[\]]+")


class ExtractSpec(BaseModel):
    """Read a value from the previous HTTP response body into scenario context."""

    var: str = Field(..., min_length=1, max_length=64)
    json_path: str = Field(..., min_length=1, max_length=256)


class InjectSpec(BaseModel):
    """Write a context variable into the request body before the call."""

    var: str = Field(..., min_length=1, max_length=64)
    json_path: str = Field(..., min_length=1, max_length=256)


class OverrideSpec(BaseModel):
    """Set a literal JSON value on the request body for this scenario run."""

    json_path: str = Field(..., min_length=1, max_length=256)
    value: Any = None


def normalize_json_path_prefix(json_path: str) -> str:
    """Accept ``data.token`` or ``$.data.token``; store/consume as ``$.…``."""
    raw = (json_path or "").strip()
    if not raw:
        return raw
    if raw.startswith("$."):
        return raw
    if raw.startswith("$"):
        rest = raw[1:].lstrip(".")
        return f"$.{rest}" if rest else "$"
    return f"$.{raw}"


def _normalize_path(json_path: str) -> list[str]:
    """
    Split a path into segments.

    Supports dotted indices (``outList.0.dt``) and bracket indices
    (``outList[0].dt``, ``$[0].id``) — same segments Postman JS uses.
    """
    raw = normalize_json_path_prefix(json_path)
    if raw.startswith("$."):
        raw = raw[2:]
    elif raw.startswith("$"):
        raw = raw[1:].lstrip(".")
    return [p for p in _PATH_SEGMENT.findall(raw) if p]


def canonicalize_json_path(json_path: str) -> str:
    """Normalize to dotted ``$.a.0.b`` form (brackets → numeric segments)."""
    parts = _normalize_path(json_path)
    if not parts:
        stripped = (json_path or "").strip()
        if stripped == "$" or stripped == "$.":
            return "$"
        return ""
    return "$." + ".".join(parts)


def json_path_get(data: Any, json_path: str) -> Any:
    """Resolve a simple dot/bracket path on dict/list roots."""
    parts = _normalize_path(json_path)
    if not parts:
        return None
    cur: Any = data
    for part in parts:
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, list) and part.isdigit():
            idx = int(part)
            cur = cur[idx] if 0 <= idx < len(cur) else None
        else:
            return None
    return cur


def json_path_set(data: dict[str, Any], json_path: str, value: Any) -> dict[str, Any]:
    """Set a path on a dict, creating intermediate dicts/lists as needed."""
    parts = _normalize_path(json_path)
    if not parts:
        return data
    root = deepcopy(data)
    if parts[0].isdigit():
        # Inject targets are request bodies (objects); ignore root-list paths.
        return root

    cur: Any = root
    for i, part in enumerate(parts[:-1]):
        nxt_part = parts[i + 1]
        want_list = nxt_part.isdigit()
        if isinstance(cur, dict):
            child = cur.get(part)
            if want_list:
                if not isinstance(child, list):
                    child = []
                    cur[part] = child
            else:
                if not isinstance(child, dict):
                    child = {}
                    cur[part] = child
            cur = child
        elif isinstance(cur, list) and part.isdigit():
            idx = int(part)
            while len(cur) <= idx:
                cur.append([] if want_list else {})
            child = cur[idx]
            if want_list:
                if not isinstance(child, list):
                    child = []
                    cur[idx] = child
            else:
                if not isinstance(child, dict):
                    child = {}
                    cur[idx] = child
            cur = child
        else:
            return root

    last = parts[-1]
    if isinstance(cur, dict):
        cur[last] = value
    elif isinstance(cur, list) and last.isdigit():
        idx = int(last)
        while len(cur) <= idx:
            cur.append(None)
        cur[idx] = value
    return root


def apply_overrides(
    request_body: dict[str, Any],
    overrides: list[OverrideSpec],
) -> dict[str, Any]:
    """Merge fixed literal values into request body (before injects)."""
    body = deepcopy(request_body)
    for spec in overrides:
        body = json_path_set(body, spec.json_path, spec.value)
    return body


def apply_injects(
    request_body: dict[str, Any],
    context: dict[str, Any],
    injects: list[InjectSpec],
) -> tuple[dict[str, Any], list[str]]:
    """Merge context variables into request body; return warnings for missing vars."""
    body = deepcopy(request_body)
    warnings: list[str] = []
    for spec in injects:
        if spec.var not in context:
            warnings.append(f"변수 '{spec.var}' 없음 (inject {spec.json_path})")
            continue
        body = json_path_set(body, spec.json_path, context[spec.var])
    return body, warnings


def apply_extracts(
    response_body: Any,
    context: dict[str, Any],
    extracts: list[ExtractSpec],
) -> dict[str, Any]:
    """Update context from response body (object or list root)."""
    out = dict(context)
    for spec in extracts:
        val = json_path_get(response_body, spec.json_path)
        if val is not None:
            out[spec.var] = val
    return out


def parse_extracts(raw: list[Any] | None) -> list[ExtractSpec]:
    if not raw:
        return []
    out: list[ExtractSpec] = []
    for item in raw:
        if isinstance(item, dict):
            try:
                out.append(ExtractSpec.model_validate(item))
            except Exception:
                continue
    return out


def parse_injects(raw: list[Any] | None) -> list[InjectSpec]:
    if not raw:
        return []
    out: list[InjectSpec] = []
    for item in raw:
        if isinstance(item, dict):
            try:
                out.append(InjectSpec.model_validate(item))
            except Exception:
                continue
    return out


def parse_overrides(raw: list[Any] | None) -> list[OverrideSpec]:
    if not raw:
        return []
    out: list[OverrideSpec] = []
    for item in raw:
        if isinstance(item, dict) and item.get("json_path"):
            try:
                out.append(OverrideSpec.model_validate(item))
            except Exception:
                continue
    return out

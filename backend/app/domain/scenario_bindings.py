"""Declarative extract/inject between scenario steps (Postman-style context, no JS)."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from pydantic import BaseModel, Field


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
    raw = normalize_json_path_prefix(json_path)
    if raw.startswith("$."):
        raw = raw[2:]
    elif raw.startswith("$"):
        raw = raw[1:].lstrip(".")
    return [p for p in raw.split(".") if p]


def json_path_get(data: Any, json_path: str) -> Any:
    """Resolve a simple dot path on dict/list roots (lists use numeric segments)."""
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
    """Set a dot path on a dict, creating intermediate dicts."""
    parts = _normalize_path(json_path)
    if not parts:
        return data
    root = deepcopy(data)
    cur: dict[str, Any] = root
    for part in parts[:-1]:
        nxt = cur.get(part)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[part] = nxt
        cur = nxt
    cur[parts[-1]] = value
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
    response_body: dict[str, Any],
    context: dict[str, Any],
    extracts: list[ExtractSpec],
) -> dict[str, Any]:
    """Update context from response body."""
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

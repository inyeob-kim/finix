"""Postman Environment / Collection variable maps and {{key}} substitution.

Read precedence for ``{{var}}`` (Postman): Environment > Collection.
Scripts are not executed; only static variable tables from JSON exports.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass
from typing import Any, Literal

PostmanDocKind = Literal["collection", "environment", "request", "unknown"]

# Plain Postman placeholders only — not Finix {{$date…}} / {{pool.x}} / {{context.X}}.
_PLAIN_VAR_RE = re.compile(r"\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}")


@dataclass(frozen=True, slots=True)
class SubstituteResult:
    """Collection after variable substitution plus unresolved placeholder keys."""

    document: Any
    resolved_count: int
    unresolved_keys: tuple[str, ...]


def classify_postman_json(payload: Any) -> PostmanDocKind:
    """Classify a Postman export JSON object."""
    if isinstance(payload, list):
        return "collection"
    if not isinstance(payload, dict):
        return "unknown"

    scope = str(payload.get("_postman_variable_scope") or "").strip().lower()
    if scope == "environment":
        return "environment"

    values = payload.get("values")
    has_item = isinstance(payload.get("item"), list)
    has_request = isinstance(payload.get("request"), dict)
    if isinstance(values, list) and not has_item and not has_request:
        if any(isinstance(row, dict) and "key" in row for row in values):
            return "environment"

    info = payload.get("info")
    if isinstance(info, dict):
        schema = str(info.get("schema") or "")
        if "collection" in schema.lower():
            return "collection"

    if has_item:
        return "collection"
    if has_request:
        return "request"
    return "unknown"


def _enabled_value_rows(rows: Any) -> dict[str, str]:
    out: dict[str, str] = {}
    if not isinstance(rows, list):
        return out
    for row in rows:
        if not isinstance(row, dict):
            continue
        if row.get("enabled") is False:
            continue
        key = str(row.get("key") or "").strip()
        if not key:
            continue
        raw = row.get("value")
        if raw is None:
            continue
        out[key] = raw if isinstance(raw, str) else str(raw)
    return out


def parse_environment_values(payload: Any) -> dict[str, str]:
    """Extract enabled key→value from a Postman Environment export."""
    if not isinstance(payload, dict):
        return {}
    return _enabled_value_rows(payload.get("values"))


def parse_collection_variables(payload: Any) -> dict[str, str]:
    """Extract enabled key→value from Collection ``variable`` array."""
    if not isinstance(payload, dict):
        return {}
    return _enabled_value_rows(payload.get("variable"))


def merge_var_maps(
    *,
    collection_vars: dict[str, str],
    environment_vars: dict[str, str],
) -> dict[str, str]:
    """
    Merge variable tables for ``{{key}}`` resolution.

    Environment overrides Collection (Postman read order).
    """
    merged = dict(collection_vars)
    merged.update(environment_vars)
    return merged


def build_var_map_for_import(
    collection: Any,
    environment: Any | None = None,
) -> dict[str, str]:
    """Build the effective var map for one import (collection + optional env)."""
    return merge_var_maps(
        collection_vars=parse_collection_variables(collection),
        environment_vars=parse_environment_values(environment)
        if environment is not None
        else {},
    )


def substitute_plain_vars_in_text(
    text: str,
    var_map: dict[str, str],
) -> tuple[str, int, set[str]]:
    """Replace ``{{key}}`` using *var_map*. Returns (text, resolved_count, unresolved)."""
    unresolved: set[str] = set()
    resolved = 0

    def repl(match: re.Match[str]) -> str:
        nonlocal resolved
        key = match.group(1)
        if key in var_map:
            resolved += 1
            return var_map[key]
        unresolved.add(key)
        return match.group(0)

    return _PLAIN_VAR_RE.sub(repl, text), resolved, unresolved


def substitute_plain_vars_in_tree(
    node: Any,
    var_map: dict[str, str],
) -> tuple[Any, int, set[str]]:
    """Deep-walk JSON-like structures and substitute plain ``{{key}}`` in strings."""
    if not var_map:
        return node, 0, set()

    resolved = 0
    unresolved: set[str] = set()

    def walk(value: Any) -> Any:
        nonlocal resolved
        if isinstance(value, str):
            next_text, n, missing = substitute_plain_vars_in_text(value, var_map)
            resolved += n
            unresolved.update(missing)
            return next_text
        if isinstance(value, list):
            return [walk(item) for item in value]
        if isinstance(value, dict):
            return {k: walk(v) for k, v in value.items()}
        return value

    return walk(node), resolved, unresolved


def prepare_collection_for_import(
    collection: Any,
    environment: Any | None = None,
    *,
    extra_var_overrides: dict[str, str] | None = None,
) -> SubstituteResult:
    """
    Copy *collection*, apply Collection + Environment vars, return substituted doc.

    *extra_var_overrides* win over Environment/Collection (e.g. script→Finix macros).
    Does not mutate the caller's object.
    """
    kind = classify_postman_json(collection)
    if kind == "environment":
        raise ValueError(
            "Environment JSON만으로는 import할 수 없습니다. Collection 또는 Request가 필요합니다."
        )
    if kind == "unknown":
        # Let existing parse raise a clearer "no requests" error later.
        doc = copy.deepcopy(collection)
        return SubstituteResult(document=doc, resolved_count=0, unresolved_keys=())

    var_map = build_var_map_for_import(collection, environment)
    if extra_var_overrides:
        var_map = {**var_map, **extra_var_overrides}
    doc = copy.deepcopy(collection)
    if not var_map:
        return SubstituteResult(document=doc, resolved_count=0, unresolved_keys=())

    substituted, resolved, unresolved = substitute_plain_vars_in_tree(doc, var_map)
    return SubstituteResult(
        document=substituted,
        resolved_count=resolved,
        unresolved_keys=tuple(sorted(unresolved)),
    )


def format_substitute_notes(result: SubstituteResult) -> list[str]:
    """Human-readable notes for import result."""
    notes: list[str] = []
    if result.resolved_count:
        notes.append(f"변수 치환 {result.resolved_count}건 (Environment > Collection)")
    if result.unresolved_keys:
        sample = ", ".join(f"{{{{{k}}}}}" for k in result.unresolved_keys[:8])
        more = (
            f" 외 {len(result.unresolved_keys) - 8}개"
            if len(result.unresolved_keys) > 8
            else ""
        )
        notes.append(f"미해석 변수: {sample}{more}")
    return notes

"""Response body diff with ignore_paths (pure, deterministic)."""

from __future__ import annotations

import copy
from typing import Any


DEFAULT_IGNORE_PATHS: tuple[str, ...] = (
    "txHms",
    "txDt",
    "guid",
    "traceId",
    "trace_id",
    "timestamp",
    "requestId",
    "request_id",
    "sysTrxNo",
    "sys_trx_no",
)


def _split_path(path: str) -> list[str]:
    raw = path.strip()
    if raw.startswith("$."):
        raw = raw[2:]
    elif raw.startswith("$"):
        raw = raw[1:].lstrip(".")
    return [p for p in raw.split(".") if p]


def strip_ignore_paths(value: Any, ignore_paths: list[str] | tuple[str, ...]) -> Any:
    """Return a deep copy of *value* with ignored leaf paths removed."""
    if not ignore_paths:
        return copy.deepcopy(value)
    data = copy.deepcopy(value)
    for path in ignore_paths:
        parts = _split_path(path)
        if not parts:
            continue
        _delete_path(data, parts)
    return data


def _delete_path(node: Any, parts: list[str]) -> None:
    if not parts or not isinstance(node, dict):
        return
    head, *rest = parts
    if not rest:
        node.pop(head, None)
        return
    child = node.get(head)
    if isinstance(child, dict):
        _delete_path(child, rest)


def _walk_diff(left: Any, right: Any, prefix: str, out: list[str], *, limit: int) -> None:
    if len(out) >= limit:
        return
    if left == right:
        return
    if type(left) is not type(right) or not isinstance(left, (dict, list)):
        out.append(prefix or "$")
        return
    if isinstance(left, list):
        if len(left) != len(right):
            out.append(prefix or "$")
            return
        for i, (a, b) in enumerate(zip(left, right, strict=True)):
            p = f"{prefix}[{i}]" if prefix else f"$[{i}]"
            _walk_diff(a, b, p, out, limit=limit)
        return
    keys = set(left) | set(right)
    for key in sorted(keys):
        p = f"{prefix}.{key}" if prefix else key
        if key not in left or key not in right:
            out.append(p)
            if len(out) >= limit:
                return
            continue
        _walk_diff(left[key], right[key], p, out, limit=limit)


def diff_json_paths(
    expected: Any,
    actual: Any,
    *,
    ignore_paths: list[str] | tuple[str, ...] | None = None,
    limit: int = 32,
) -> list[str]:
    """Return JSON paths that differ after stripping ignore_paths."""
    paths = ignore_paths if ignore_paths is not None else DEFAULT_IGNORE_PATHS
    left = strip_ignore_paths(expected, paths)
    right = strip_ignore_paths(actual, paths)
    out: list[str] = []
    _walk_diff(left, right, "", out, limit=limit)
    return out


def should_compare_response_body(expected_body: dict[str, Any] | None) -> bool:
    """True when expected body has payload fields beyond metadata keys."""
    if not expected_body:
        return False
    meta = {"outcome", "error_code", "messageId", "http_status", "status"}
    return any(k not in meta for k in expected_body.keys())

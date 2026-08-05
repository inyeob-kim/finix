"""Canonical ordering for YAML service rules: Normal then Error."""

from __future__ import annotations

import re
from typing import Any


def case_id_sort_key(case_id: str) -> tuple[Any, ...]:
    """Numeric-aware fragments so N-002 < N-010."""
    parts = re.split(r"(\d+)", case_id or "")
    out: list[Any] = []
    for part in parts:
        if not part:
            continue
        if part.isdigit():
            out.append(int(part))
        else:
            out.append(part.lower())
    return tuple(out)


def sort_rules_normal_then_error(payload: dict[str, Any]) -> dict[str, Any]:
    """Order rules: Normal (N) ascending, then Error (E) ascending by case_id."""
    rules = payload.get("rules")
    if not isinstance(rules, list) or not rules:
        return payload

    def sort_key(rule: Any) -> tuple[int, tuple[Any, ...]]:
        if not isinstance(rule, dict):
            return (2, ())
        rtype = str(rule.get("rule_type") or "").strip().upper()
        if rtype == "N":
            type_rank = 0
        elif rtype == "E":
            type_rank = 1
        else:
            type_rank = 2
        cid = str(rule.get("case_id") or rule.get("rule_id") or "").strip()
        return (type_rank, case_id_sort_key(cid))

    payload["rules"] = sorted(rules, key=sort_key)
    return payload

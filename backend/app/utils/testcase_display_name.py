"""Display names for YAML-materialized HTTP test cases."""

from __future__ import annotations

from typing import Any

_LABEL_MAX_LEN = 48


def _collapse_ws(text: str) -> str:
    return " ".join(text.split())


def _truncate(text: str, max_len: int = _LABEL_MAX_LEN) -> str:
    collapsed = _collapse_ws(text)
    if len(collapsed) <= max_len:
        return collapsed
    return collapsed[: max_len - 1].rstrip() + "…"


def rule_type_label(rule: dict[str, Any]) -> str:
    """Return ``E`` (error) or ``N`` (normal) for a YAML rule row."""
    raw = str(rule.get("rule_type") or "").strip().upper()
    if raw in {"E", "ERROR"}:
        return "E"
    if raw in {"N", "NORMAL", "SUCCESS"}:
        return "N"
    expect = rule.get("expect")
    if isinstance(expect, dict):
        if str(expect.get("outcome") or "").strip().lower() == "error":
            return "E"
    return "N"


def _label_from_rule(rule: dict[str, Any]) -> str:
    title = str(rule.get("title") or "").strip()
    if title:
        return title
    expect = rule.get("expect")
    if isinstance(expect, dict):
        validation = str(expect.get("validation_target") or "").strip()
        if validation:
            return _truncate(validation)
    description = str(rule.get("description") or "").strip()
    if description:
        return _truncate(description)
    return ""


def build_materialized_testcase_name(
    *,
    case_id: str,
    rule: dict[str, Any],
    instruction: str | None = None,
) -> str:
    """
  Build a short, scannable name for scenario assembly.

  Examples:
    ``[E] PY027-E-001 · AAPCME0006 · pymntDt 누락``
    ``[N] PY027-N-001 · txDt 검증``
    """
    cid = (case_id or "").strip()
    rtype = rule_type_label(rule)
    label = _label_from_rule(rule)
    expect = rule.get("expect")
    error_code = ""
    if isinstance(expect, dict):
        error_code = str(expect.get("error_code") or "").strip()

    segments: list[str] = [f"[{rtype}] {cid}"]
    if rtype == "E" and error_code:
        segments.append(error_code)
    if label:
        segments.append(label)
    name = " · ".join(segments)
    instr = (instruction or "").strip()
    if instr:
        name = f"{name} ({instr})"
    return name

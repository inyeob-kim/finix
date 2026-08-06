"""Encode/decode YAML rule dicts <-> fnx_rule_case column values."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.domain.yaml_rules_order import sort_rules_normal_then_error
from app.utils.finix_yaml_dump import dump_finix_yaml


def dumps_json(value: Any) -> str | None:
    """Serialize JSON-compatible value; None stays None."""
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def loads_json(text: str | None, default: Any = None) -> Any:
    """Parse JSON text; return default on empty/invalid."""
    if not (text or "").strip():
        return default
    try:
        return json.loads(text)
    except Exception:  # noqa: BLE001
        return default


def case_checksum_from_rule(rule: dict[str, Any]) -> str:
    """Stable hash for one rule object (canonical JSON)."""
    payload = {
        "case_id": str(rule.get("case_id") or "").strip(),
        "rule_type": str(rule.get("rule_type") or "").strip().upper(),
        "title": rule.get("title"),
        "description": rule.get("description"),
        "input": rule.get("input"),
        "expect": rule.get("expect"),
        "assertions": rule.get("assertions"),
        "tags": rule.get("tags"),
        "source_evidence": rule.get("source_evidence"),
        "folder": rule.get("folder"),
        "extract": rule.get("extract"),
        "use": rule.get("use"),
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def rule_dict_from_case_columns(
    *,
    case_id: str,
    rule_type: str | None,
    title: str | None,
    description: str | None,
    input_json: str | None,
    expect_json: str | None,
    assertions_json: str | None,
    tags_json: str | None,
    evidence_json: str | None,
    folder: str | None,
    extra_json: str | None = None,
) -> dict[str, Any]:
    """Build a YAML rule dict from stored column values."""
    rule: dict[str, Any] = {
        "case_id": case_id,
        "rule_type": (rule_type or "N").strip().upper() or "N",
        "title": title or "",
        "description": description or "",
        "input": loads_json(input_json, default={}) or {},
        "expect": loads_json(expect_json, default={}) or {},
        "assertions": loads_json(assertions_json, default=[]) or [],
        "tags": loads_json(tags_json, default=[]) or [],
        "source_evidence": loads_json(evidence_json, default={}) or {},
    }
    if folder:
        rule["folder"] = folder
    extra = loads_json(extra_json, default=None)
    if isinstance(extra, dict):
        for key in ("extract", "use"):
            if key in extra:
                rule[key] = extra[key]
    return rule


def applied_rule_dict_from_row(row: Any) -> dict[str, Any]:
    """Applied fields from an FnxRuleCase-like row."""
    return rule_dict_from_case_columns(
        case_id=row.rule_case_id,
        rule_type=row.rule_type,
        title=row.title,
        description=row.description,
        input_json=row.input_json,
        expect_json=row.expect_json,
        assertions_json=row.assertions_json,
        tags_json=row.tags_json,
        evidence_json=row.evidence_json,
        folder=row.folder,
        extra_json=getattr(row, "extra_json", None),
    )


def draft_rule_dict_from_row(row: Any) -> dict[str, Any] | None:
    """Draft fields when draft_checksum is set; else None."""
    if not (getattr(row, "draft_checksum", None) or "").strip():
        return None
    return rule_dict_from_case_columns(
        case_id=row.rule_case_id,
        rule_type=row.draft_rule_type or row.rule_type,
        title=row.draft_title if row.draft_title is not None else row.title,
        description=(
            row.draft_description
            if row.draft_description is not None
            else row.description
        ),
        input_json=row.draft_input_json,
        expect_json=row.draft_expect_json,
        assertions_json=row.draft_assertions_json,
        tags_json=row.draft_tags_json,
        evidence_json=row.draft_evidence_json,
        folder=row.draft_folder if row.draft_folder is not None else row.folder,
        extra_json=(
            getattr(row, "draft_extra_json", None)
            if getattr(row, "draft_extra_json", None) is not None
            else getattr(row, "extra_json", None)
        ),
    )


def assemble_payload_from_rules(
    *,
    svc_code: str,
    service_name: str | None,
    rules: list[dict[str, Any]],
    source_version: str | None = None,
) -> dict[str, Any]:
    """Build a full FINIX YAML document payload from case rule dicts."""
    payload: dict[str, Any] = {
        "service_code": svc_code,
        "service_name": service_name or svc_code,
        "rules": list(rules),
    }
    if source_version:
        payload["source_version"] = source_version
    return sort_rules_normal_then_error(payload)


def assemble_yaml_from_rules(
    *,
    svc_code: str,
    service_name: str | None,
    rules: list[dict[str, Any]],
    source_version: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """Assemble canonical YAML text + parsed payload."""
    payload = assemble_payload_from_rules(
        svc_code=svc_code,
        service_name=service_name,
        rules=rules,
        source_version=source_version,
    )
    return dump_finix_yaml(payload), payload


def extract_rules_list(parsed_or_json: Any) -> list[dict[str, Any]]:
    """
    Normalize rules list from a parsed YAML payload or rules_json string/object.
    """
    payload = parsed_or_json
    if isinstance(payload, str):
        payload = loads_json(payload, default={})
    if not isinstance(payload, dict):
        return []
    rules = payload.get("rules")
    if not isinstance(rules, list):
        return []
    return [r for r in rules if isinstance(r, dict)]


def sort_order_for_rule(rule: dict[str, Any], index: int) -> int:
    """Stable sort_order matching N-then-E document order."""
    return index


def snapshot_json_for_rule(rule: dict[str, Any]) -> str:
    """Serialize a full case snapshot for history."""
    return json.dumps(rule, ensure_ascii=False, sort_keys=True, default=str)

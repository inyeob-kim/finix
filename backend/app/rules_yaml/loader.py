"""YAML rule loader for service-based testcase generation."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True, slots=True)
class ServiceRuleBundle:
    service_code: str
    service_name: str | None
    source_version: str | None
    rules: list[dict[str, Any]]


def _rules_dir() -> Path:
    # backend/app/rules_yaml/
    return Path(__file__).resolve().parent


def load_service_rules(service_code: str) -> ServiceRuleBundle | None:
    """Load YAML rules by service_code from rules directory."""
    code = (service_code or "").strip()
    if not code:
        return None
    path = _rules_dir() / f"{code}.yaml"
    if not path.exists():
        return None
    payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(payload, dict):
        return None
    rules = payload.get("rules") or []
    if not isinstance(rules, list):
        rules = []
    return ServiceRuleBundle(
        service_code=str(payload.get("service_code") or code),
        service_name=(payload.get("service_name") or None),
        source_version=(payload.get("source_version") or None),
        rules=[r for r in rules if isinstance(r, dict)],
    )


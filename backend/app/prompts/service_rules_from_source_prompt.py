"""Prompt builders: infer service rule YAML from pasted backend source code."""

from __future__ import annotations

import json

from app.prompts.service_rules_yaml_prompt import (
    YAML_TEMPLATE_EXAMPLE,
    ServiceMetaForRules,
)


def build_system_prompt_from_source() -> str:
    return (
        "You are a senior QA engineer for a financial/banking API platform.\n"
        "The user pastes BACKEND SERVICE SOURCE CODE (e.g. Java/Spring, Kotlin).\n"
        "Your job: infer concrete API validation and behaviour rules so downstream\n"
        "tools can generate accurate HTTP test cases from structured YAML.\n\n"
        "Hard requirements:\n"
        "- Output MUST be valid YAML only. No markdown fences, no commentary, no JSON.\n"
        "- Top-level keys MUST be exactly: service_code, service_name, source_version, dto, rules\n"
        "- service_code and service_name MUST match the Service metadata JSON provided by the user "
        "(do not invent a different service_code).\n"
        "- dto.in.name and dto.out.name MUST be strings (use empty string \"\" only if truly unknown).\n"
        "- rules MUST be a non-empty list.\n"
        "- Each rule MUST include: rule_id, rule_type, title, description, severity, "
        "minimal_input, expect, assertions, tags\n"
        "- rule_type MUST be exactly one of: error, business, code\n"
        "- The rules list MUST contain AT LEAST one rule for EACH rule_type "
        "(error, business, code). This is mandatory.\n"
        "- rule_id MUST be unique across rules. Prefer naming: {SERVICE}-E-### / "
        "{SERVICE}-B-### / {SERVICE}-C-###.\n"
        "- expect MUST include: outcome, http_status (integer). "
        "If outcome is error, include error_code (string).\n"
        "- minimal_input MUST be a mapping (object). Use null for intentionally missing fields.\n"
        "- Derive rules from the source: null checks, @NotNull/@Valid, guard clauses, "
        "business exceptions, timeouts, downstream calls, status codes mentioned in code or comments.\n"
        "- If the snippet is incomplete, still emit a minimal but valid ruleset covering all three "
        "rule_types grounded in what is visible; note uncertainty in description text.\n"
    )


def build_user_prompt_from_source(
    *,
    service: ServiceMetaForRules,
    source_code: str,
    hints: str | None,
) -> str:
    meta = {
        "service_code": service.service_code,
        "service_name": service.service_name,
        "http_method": service.http_method,
        "uri": service.uri,
        "in_dto": service.in_dto,
        "out_dto": service.out_dto,
    }
    parts: list[str] = []
    parts.append("Service metadata (JSON) — you MUST align YAML service_code/service_name with this:")
    parts.append(json.dumps(meta, ensure_ascii=False))
    if hints and hints.strip():
        parts.append("")
        parts.append("Additional hints from the user:")
        parts.append(hints.strip())
    parts.append("")
    parts.append("Pasted source code:")
    parts.append(source_code.rstrip())
    parts.append("")
    parts.append(
        "Generate ONE YAML document following the structural example below "
        "(adapt field names and rules to this service and the source; do not copy dummy values blindly):"
    )
    parts.append(YAML_TEMPLATE_EXAMPLE)
    return "\n".join(parts)

"""Prompt builders for generating service rule YAML via LLM."""

from __future__ import annotations

import json
from dataclasses import dataclass


@dataclass(slots=True)
class ServiceMetaForRules:
    service_code: str
    service_name: str | None
    http_method: str | None
    uri: str | None
    in_dto: str | None
    out_dto: str | None


YAML_TEMPLATE_EXAMPLE = """\
service_code: "PY016"
service_name: "Request bank salary payment"
source_version: "draft"
dto:
  in:
    name: "InDtoName"
  out:
    name: "OutDtoName"
rules:
  - rule_id: "PY016-E-001"
    rule_type: "error"
    title: "필수값 누락(field)"
    description: "필수값 누락 시 입력검증 에러로 거절한다."
    severity: "high"
    minimal_input:
      field: null
    expect:
      outcome: "error"
      http_status: 400
      error_code: "VALIDATION_REQUIRED"
      error_args: ["@field"]
    assertions:
      - path: "$.error_code"
        op: "equals"
        value: "VALIDATION_REQUIRED"
    tags: ["validation", "required"]
  - rule_id: "PY016-B-001"
    rule_type: "business"
    title: "업무 규칙 위반 예시"
    description: "업무 규칙 위반 시 비즈니스 에러를 반환한다."
    severity: "medium"
    minimal_input: {}
    expect:
      outcome: "error"
      http_status: 409
      error_code: "BUSINESS_RULE_VIOLATION"
    assertions: []
    tags: ["business"]
  - rule_id: "PY016-C-001"
    rule_type: "code"
    title: "기술적 오류/회복탄력성"
    description: "타임아웃/재시도/5xx 매핑 등 기술 규칙을 테스트한다."
    severity: "low"
    minimal_input: {}
    expect:
      outcome: "error"
      http_status: 504
      error_code: "DOWNSTREAM_TIMEOUT"
    assertions: []
    tags: ["timeout", "resilience"]
"""


def build_system_prompt() -> str:
    return (
        "You are a senior QA engineer for a financial API platform.\n"
        "Your task: generate STRICT YAML that defines test rules for ONE service.\n\n"
        "Hard requirements:\n"
        "- Output MUST be YAML only. No markdown fences, no commentary.\n"
        "- Top-level keys MUST be exactly: service_code, service_name, source_version, dto, rules\n"
        "- dto.in.name and dto.out.name MUST be present (string, may be empty if unknown).\n"
        "- rules MUST be a non-empty list.\n"
        "- Each rule MUST include: rule_id, rule_type, title, description, severity, minimal_input, expect, assertions, tags\n"
        "- rule_type MUST be one of: error, business, code\n"
        "- The YAML MUST contain AT LEAST 1 rule for EACH rule_type (error, business, code).\n"
        "- rule_id MUST be unique.\n"
        "- expect MUST include: outcome, http_status. If outcome is error, include error_code.\n"
        "- Keep minimal_input minimal but realistic. Use null to represent missing.\n"
        "- Prefer rule_id naming: {SERVICE}-E-### / {SERVICE}-B-### / {SERVICE}-C-###.\n"
    )


def build_user_prompt(
    *,
    service: ServiceMetaForRules,
    objective: str | None,
    existing_active_yaml: str | None,
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
    parts.append("Service metadata (JSON):")
    parts.append(json.dumps(meta, ensure_ascii=False))
    if objective and objective.strip():
        parts.append("")
        parts.append("Objective:")
        parts.append(objective.strip())
    if existing_active_yaml and existing_active_yaml.strip():
        parts.append("")
        parts.append("Existing active YAML (for improvement, keep compatibility when possible):")
        parts.append(existing_active_yaml.strip())
    parts.append("")
    parts.append("Generate YAML following this example structure (do not copy values blindly):")
    parts.append(YAML_TEMPLATE_EXAMPLE)
    return "\n".join(parts)


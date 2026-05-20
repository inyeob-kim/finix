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


INPUT_AND_ASSERTION_GUIDANCE = """\
input structure:
- Place shared top-level request fields at the root of input.
- Place list-specific fields inside array items only.
- Example:
  input:
    custId: null
    regList:
      - trgtAcctNbr: null
- Do NOT nest unrelated root fields inside array items.

Input completeness (In DTO / OMM):
- Every rule's input MUST list every property of the service request payload for that service:
  use null (or [] for empty lists) for properties that are not exercised by the case, and set
  concrete values only where the case validates or drives behavior.
- Do not omit DTO keys entirely: downstream editors and HTTP test bodies should show the full
  shape so users only adjust values, not hunt for field names.

HTTP status and assertions (business-first):
- Set expect.http_status only when the objective or an explicit spec states it; otherwise null
  or omit. Do not guess common codes.
- Prefer specific assertions tied to the rule's outcome; use assertions: [] when nothing can
  be asserted confidently without inventing paths.

Assertion requirements:
- assertions is a list and MAY be empty when no path can be asserted without guessing.
- Error Case (rule_type=E): when assertions is non-empty, the first assertion MUST validate
  $.error_code equals expect.error_code.
- Normal Case (rule_type=N): when assertions is non-empty, they MUST validate output fields that
  are explicitly set in the source. Do not fabricate JSON paths that are not inferable from the code.
- source_evidence.snippet MUST be concise (max ~200 characters), single-line when possible.

Additional guidance for assertions:
- Assertions MUST reference only fields that are actually present in the service output DTO.
- Do NOT invent synthetic fields such as $.smsNotificationSent unless such a field is explicitly set
  in the output object.
- If a business effect is observable only through an internal method call and not exposed in the
  response, describe it in validation_target and source_evidence, but use assertions on real
  output fields.
- When enum.getValue() is used and the concrete literal is not visible in the source, prefer
  assertions such as not_null instead of guessing the exact value.
- Every out.setXXX(...) statement in the output assembly method should be considered a candidate
  for validation assertions."""


GENERALIZATION_RULES_FOR_ALL_SERVICES = """\
Generalization Rules for All Services:

Assertion Safety Rules:
- Assertions MUST reference only fields that are explicitly present in the output DTO or clearly
  assigned in the output assembly method.
- Do NOT invent synthetic fields that are not part of the service response.
- If a business effect is implemented through an internal method call (such as SMS sending,
  notification, audit logging, or downstream invocation) but is not exposed in the output DTO,
  describe the effect in validation_target and source_evidence, but use assertions only on real
  output fields.
- When source code uses Enum.getValue(), constant lookups, or utility methods whose literal return
  value is not visible, do NOT guess the exact value. Use not_null, not_empty, or other
  non-literal assertions instead.
- Prefer assertions based on observable response fields over assumptions about hidden internal state.

Output DTO Coverage Rules:
- Every out.setXXX(...) statement in the output assembly method should be treated as a candidate
  for validation assertions.
- If multiple important output fields are assigned, generate one or more normal cases to validate them.
- Typical examples include transaction date/time, sequence number, account balance, identifiers,
  propagated input values, and status fields.

Internal Processing Rules:
- Field mappings such as basicInfo.setXXX(in.getXXX()) represent meaningful implementation behavior
  and should be considered for normal cases when they affect observable results.
- Default value assignments using conditional expressions should generate dedicated normal cases.
- Conditional method calls (for example notification sending, history creation, fee processing,
  or approval logic) should generate normal cases when they represent distinct business behavior.

Non-Observable Effects:
- If an internal action cannot be directly verified through the response payload, do not fabricate
  a fake assertion field.
- Instead, assert real output fields that confirm the transaction completed successfully, while
  documenting the internal effect in validation_target.

Quality Goal:
- The generated YAML must be robust across all service types, not only the current example.
- Favor conservative, source-backed assertions over speculative exact values.
- The YAML should be directly executable by automated regression test generators without requiring
  manual correction."""


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
  - case_id: "PY016-E-001"
    rule_type: "E"
    title: "Validation of required customer information"
    description: "The service rejects requests when customer information is invalid."
    input:
      custId: null
      regList:
        - trgtAcctNbr: null
    expect:
      outcome: "error"
      http_status: 400
      error_code: "AAPARE0001"
    assertions:
      - path: "$.error_code"
        op: "equals"
        value: "AAPARE0001"
    tags: ["input"]
    source_evidence:
      method: "_validateInput"
      snippet: "throw new BizApplicationException(\"AAPARE0001\", ...)"
  - case_id: "PY016-E-002"
    rule_type: "E"
    title: "Business rule enforcement"
    description: "A business constraint visible in the source is enforced before processing."
    input:
      custId: "CUST001"
    expect:
      outcome: "error"
      http_status: 409
      error_code: "BAPPYE0008"
    assertions:
      - path: "$.error_code"
        op: "equals"
        value: "BAPPYE0008"
    tags: ["business"]
    source_evidence:
      method: "execute"
      snippet: "throw new BizApplicationException(\"BAPPYE0008\")"
  - case_id: "PY016-N-001"
    rule_type: "N"
    title: "Transaction output assembly"
    description: "Successful processing populates observable transaction fields on the response."
    input:
      custId: "CUST001"
    expect:
      outcome: "success"
      http_status: 200
      validation_target: "transaction date/time fields are populated"
    assertions:
      - path: "$.txDt"
        op: "not_null"
      - path: "$.txHms"
        op: "not_null"
    tags: ["business"]
    source_evidence:
      method: "buildOutput"
      snippet: "out.setTxDt(...); out.setTxHms(...)"
  - case_id: "PY016-N-002"
    rule_type: "N"
    title: "Output list size matches input list size"
    description: "Successful processing returns one result entry per input list item."
    input:
      custId: "CUST001"
      regList:
        - trgtAcctNbr: "1234567890"
        - trgtAcctNbr: "0987654321"
    expect:
      outcome: "success"
      http_status: 200
      validation_target: "output list size matches input list size"
    assertions:
      - path: "$.resultList"
        op: "not_null"
    tags: ["business"]
    source_evidence:
      method: "processRegList"
      snippet: "for (RegItem item : in.getRegList()) { ... }"
"""


def schema_hard_requirements() -> str:
    """Shared YAML schema rules for all service-rules LLM prompts."""
    return (
        "Hard requirements:\n"
        "- Output MUST be valid YAML only. No markdown fences, no commentary, no JSON.\n"
        "- Top-level keys MUST be exactly: service_code, service_name, source_version, dto, rules\n"
        "- service_code and service_name MUST match the Service metadata JSON provided by the user "
        "(do not invent a different service_code).\n"
        "- dto.in.name and dto.out.name MUST be strings (use empty string \"\" only if truly unknown).\n"
        "- rules MUST be a non-empty list.\n"
        "- Use case_id instead of rule_id.\n"
        "- Use input instead of minimal_input.\n"
        "- Do NOT include severity.\n"
        "- rule_type values must be E and N only:\n"
        "  - E: Error Case (validation failure, guard clause, business exception)\n"
        "  - N: Normal Case (successful path, observable output verification)\n"
        "- Each case MUST include ALL of: case_id, rule_type, title, description, input, expect, "
        "assertions, tags, source_evidence\n"
        "- Each case's input MUST be a complete map of the service In DTO / OMM: include every "
        "request property key; use null for unused fields in that case (never omit keys that exist "
        "on the DTO).\n"
        "- case_id MUST be unique across cases. Naming convention:\n"
        "  - Error: {SERVICE}-E-001, {SERVICE}-E-002, ...\n"
        "  - Normal: {SERVICE}-N-001, {SERVICE}-N-002, ...\n"
        "- expect MUST include: outcome (error|success).\n"
        "- expect.http_status: include ONLY if the objective, pasted spec, or source explicitly "
        "states an HTTP status; otherwise set it to null or omit the key. Never guess 200/400/500.\n"
        "- Error Case (rule_type=E): expect MUST include error_code (string).\n"
        "- Normal Case (rule_type=N): expect MUST include validation_target (string) describing "
        "what successful response behavior is verified, e.g. "
        "\"transaction date/time fields are populated\", "
        "\"output list size matches input list size\", "
        "\"account number is returned\".\n"
        "- assertions: a list (may be empty). If non-empty, each item MUST be a valid assertion map. "
        "For rule_type=E with a non-empty assertions list, the first assertion MUST validate "
        "$.error_code equals expect.error_code.\n"
        "- tags MUST be a list containing only: input, business (one or both allowed).\n"
        "  - input: null check, required field, format validation, size/range validation\n"
        "  - business: business rules, branching logic, processing/output behavior\n"
        "- source_evidence MUST include:\n"
        "  - method: the method name where the case is derived\n"
        "  - snippet: a short code fragment (max ~200 chars, single line) verbatim from the source\n"
        "- Minimum output: at least 1 Error case (E) AND at least 1 Normal case (N).\n"
        "- Do NOT use legacy fields or values: rule_id, minimal_input, severity, "
        "rule_type error/business/code.\n"
    )


def build_system_prompt() -> str:
    return (
        "You are a senior QA engineer for a financial/banking API platform.\n"
        "Your task: generate STRICT YAML that defines BUSINESS-MEANINGFUL test cases for ONE service "
        "based on service metadata and the user's objective.\n"
        "Exclude framework/DI/logging noise; consolidate related behavior; do not invent HTTP "
        "status codes; use assertions: [] when no confident assertion exists.\n\n"
        f"{schema_hard_requirements()}\n"
        f"{GENERALIZATION_RULES_FOR_ALL_SERVICES}\n\n"
        f"{INPUT_AND_ASSERTION_GUIDANCE}\n"
    )


_CACHED_TEMPLATE_SECTION = (
    "\n\nStructural YAML example (adapt field names and cases to the service; "
    "do not copy dummy values blindly):\n"
)


def build_yaml_ai_cached_system_prompt() -> str:
    """Static system + template for provider prompt caching (objective-based YAML AI)."""
    return build_system_prompt() + _CACHED_TEMPLATE_SECTION + YAML_TEMPLATE_EXAMPLE


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
    parts.append("Service metadata (JSON) — you MUST align YAML service_code/service_name with this:")
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
    parts.append(
        "Generate ONE YAML document using the structural example from the system prompt."
    )
    return "\n".join(parts)

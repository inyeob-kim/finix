"""Prompt builders: infer service rule YAML from pasted backend source code."""

from __future__ import annotations

import json

from app.prompts.service_rules_yaml_prompt import (
    GENERALIZATION_RULES_FOR_ALL_SERVICES,
    INPUT_AND_ASSERTION_GUIDANCE,
    YAML_TEMPLATE_EXAMPLE,
    ServiceMetaForRules,
    schema_hard_requirements,
)

BUSINESS_ORIENTED_EXTRACTION_GLOBAL = """\
BUSINESS-ORIENTED EXTRACTION (applies to every Java/Kotlin service class)

[Global objective]
Extract rules by business meaning, not by implementation mechanics. Prefer fewer, clearer
rules that QA, analysts, and automation can use.

1) Exclude technical implementation details
Do NOT emit cases for framework or infrastructure-only behavior, including:
- Spring bean initialization, lazy init, dependency injection, ApplicationContext / getBean(...)
- Service-locator or wiring whose sole purpose is retrieving another bean
- Logging setup, generic getters that only return injected dependencies
- Annotations and metadata by themselves (use them only as hints for real business constraints)

2) Implicit exception rules (business-relevant only)
When the source calls methods that may fail and failure is not caught locally, you MAY infer
business-relevant error cases only when the failure mode is clear from naming, Javadoc, or
domain conventions (e.g. entity not found, approval rejected, invalid id, parse failures,
external service failure). Do NOT invent error codes or HTTP layers not evidenced in source.

3) Consolidate overly granular rules
Do NOT create one rule per setter or trivial step. Merge related assignments that realize ONE
business outcome (e.g. one approval call, one transaction creation, one domain action) into a
single rule with a cohesive title, description, and validation_target.

4) HTTP status (expect.http_status)
If the source or an attached spec does NOT state an HTTP status, set expect.http_status to null
or omit the key. Do NOT guess 200, 400, 404, or 500.

5) Assertions
Each assertion should validate a concrete business outcome. Avoid repeating the same generic
assertion across unrelated rules. If no assertion can be stated confidently, use an empty list:
assertions: []

6) Prioritize business-relevant topics
Favor: input validation, required fields, lookups and lookup failures, status transitions,
transaction/approval flows, defaults with business effect, business exceptions, meaningful output
assembly, end-to-end user-visible outcomes.

7) Reduce noise and duplication
Merge repetitive or overlapping logic. Target on the order of 15–20 high-value rules for a
typical medium service rather than dozens of low-level technical micro-rules (larger orchestration
services may need more).

8) Output quality
Each rule should state: what business behavior, under which condition, what outcome or error,
and source_evidence pointing to real code. The bundle should be readable without walking every
line of implementation.
"""


SOURCE_ANALYSIS_CHECKLIST = """\
Analyze the pasted service source for BUSINESS-observable behavior. Inspect (when relevant):
1. Public entry / execute methods and documented contracts (Javadoc, @throws)
2. Validation and guard clauses that affect customer-visible outcomes
3. Branches that change business results (not optional logging-only paths)
4. BizApplicationException and other business exceptions with codes or clear semantics
5. Downstream calls whose failure or result matters to the business response
6. Input reads (in.getXXX()) that drive validation, defaults, or branching
7. Output assembly (out.setXXX) only when grouped into a consolidated business outcome
8. Comments that state real business constraints

Do NOT treat every private helper, every setter, or every framework hook as its own rule.
Consolidate. Only emit cases that are justified by observable source (or clearly implied
business failures per section 2 above).
"""


SOURCE_INTERPRETATION_AND_QUALITY_GUIDANCE = """\
Absolute prohibitions:
- Do NOT emit rules for Spring wiring, bean factories, context lookups, or DI-only getters.
- Do NOT create Error cases (E) for conditions that only skip optional work without throwing.
- NEVER invent validation rules not supported by the pasted source.

Source interpretation:
- If a conditional does NOT throw or return a documented business error, do NOT create E for it.
- Optional features (SMS, notification, audit) → Normal (N) only when the source ties them to
  a testable outcome; otherwise omit micro-rules.
- Consolidate multiple out.setXXX lines that populate one business result into one N case when
  assertions can describe that outcome together.

validation_target (for rule_type=N):
- MUST be a clear business statement (what success means for the customer/domain).

Output consistency:
- NEVER include minimal_input or severity.
- Every Normal case MUST include expect.validation_target.
- Every case MUST include source_evidence.method and source_evidence.snippet.

Quality goals:
- Business clarity beats raw line-by-line coverage.
- Prefer consolidated rules over exhaustive per-line rules.
- Returning null or skipping optional processing is NOT an error unless the source says it is.
"""


BUSINESS_ORIENTED_CASE_EXTRACTION_RULES = """\
BUSINESS-ORIENTED CASE EXTRACTION RULES

Primary objective:
- Capture complete BUSINESS behavior (validation, domain errors, approvals, transactions,
  meaningful outputs) while excluding framework noise.

Case granularity:
- One case per DISTINCT business rule or user-visible outcome — not per implementation line.
- Merge related field assignments and a single domain action into ONE case.
- Split only when two behaviors are independently testable and business-meaningful.

Input and lookups:
- Cover input validation and required fields when the source enforces them.
- Cover lookup / parse / enum conversion failures when failure modes are clear (see global §2).

Output and side effects:
- Group output assembly into consolidated N cases where possible instead of one case per setter.

Implicit failures:
- When a call clearly implies not-found, rejected approval, parse errors, etc., you may add E
  cases with error_code ONLY if the source or comments supply a code or you can quote the throw
  site; otherwise prefer N with validation_target describing the risk, or omit.

Case volume:
- Aim for ~15–20 strong rules on a medium service; complex orchestration may require more.
- Fewer than 4 cases usually means missing obvious business rules — add them.
- Dozens of trivial setter-only rules are unacceptable — merge them.

Completeness self-check (before final output):
1. Every business exception path with a code in source → E case?
2. Every documented validation → E or N as appropriate?
3. Major success paths (transaction, approval, creation) → consolidated N cases?
4. No rules left that only mirror Spring/DI/logging?
5. http_status null unless explicitly known?
6. Assertions non-generic and non-duplicated across unrelated rules (or empty if unsure)?
"""


BUSINESS_COVERAGE_TARGETS = """\
BUSINESS COVERAGE TARGETS (not line-by-line completeness)

- Simple service: aim for at least ~5 meaningful business rules.
- Medium service: often ~10–20 consolidated rules.
- Large orchestration: more as needed, still avoiding implementation noise.

Error cases (E):
- Emit E ONLY when the source throws a business/validation exception or documents a failure
  that maps to an error outcome you can evidence.

Normal cases (N):
- Prefer fewer N cases that each assert a whole business outcome over many N cases per setter.

If the pasted class is mostly wiring with little domain logic, produce only the few rules that
are truly business-relevant — do NOT pad with technical cases.
"""


def build_system_prompt_from_source() -> str:
    return (
        "You are a senior QA engineer for a financial/banking API platform.\n"
        "The user pastes BACKEND SERVICE SOURCE CODE (e.g. Java/Spring, Kotlin).\n"
        "Your job: extract BUSINESS-MEANINGFUL validation and domain rules so downstream tools can\n"
        "build HTTP tests from structured YAML — not to mirror every implementation line.\n\n"
        "Primary goal: business clarity and consolidated coverage.\n"
        "- Prefer consolidated rules over per-setter micro-rules.\n"
        "- Exclude framework/DI/logging-only behavior.\n"
        "- Use null or omit expect.http_status when the source does not state an HTTP code.\n"
        "- Use assertions: [] when no confident assertion exists; otherwise assert specific outcomes.\n\n"
        f"{schema_hard_requirements()}\n"
        "- Do NOT invent cases that are not directly supported by the pasted source code.\n\n"
        f"{BUSINESS_ORIENTED_EXTRACTION_GLOBAL}\n\n"
        f"{SOURCE_INTERPRETATION_AND_QUALITY_GUIDANCE}\n\n"
        f"{BUSINESS_ORIENTED_CASE_EXTRACTION_RULES}\n\n"
        f"{BUSINESS_COVERAGE_TARGETS}\n\n"
        f"{GENERALIZATION_RULES_FOR_ALL_SERVICES}\n\n"
        f"{INPUT_AND_ASSERTION_GUIDANCE}\n"
    )


def build_yaml_ai_cached_system_prompt_from_source() -> str:
    """Static system + checklist + template for provider prompt caching (source YAML AI)."""
    return (
        f"{build_system_prompt_from_source()}\n\n"
        f"{SOURCE_ANALYSIS_CHECKLIST}\n\n"
        "Structural YAML example (adapt field names and cases to the service and source; "
        "prefer consolidated business rules; do not copy dummy values blindly):\n"
        f"{YAML_TEMPLATE_EXAMPLE}"
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
        "Generate ONE YAML document using the structural example from the system prompt. "
        "Prioritize consolidated business rules; avoid framework noise."
    )
    return "\n".join(parts)


def build_repair_user_prompt(*, validation_error: str, invalid_yaml: str) -> str:
    return (
        "The previous YAML failed validation with the following error:\n"
        f"{validation_error.strip()}\n\n"
        "Invalid YAML:\n"
        f"{invalid_yaml.rstrip()}\n\n"
        "Correct the YAML while preserving all valid cases.\n"
        "Use case_id (not rule_id), input (not minimal_input), rule_type E or N only.\n"
        "Do NOT include severity.\n"
        "Error cases must have expect.error_code; Normal cases must have expect.validation_target.\n"
        "Error cases with a non-empty assertions list: first assertion MUST match $.error_code to "
        "expect.error_code.\n"
        "assertions may be an empty list when no confident assertion exists.\n"
        "expect.http_status may be null or omitted when the source does not define HTTP status.\n"
        "Assertions must use real output DTO fields only; do not invent synthetic JSON paths.\n"
        "Use not_null/not_empty when enum or constant literal values are not visible in source.\n"
        "Normalize input: root fields at top level, list item fields inside arrays only.\n"
        "Each rule's input must list every In DTO / OMM property (null when not used for that case).\n"
        "tags must contain only: input, business.\n"
        "Return YAML only. Do not include explanations or markdown fences."
    )

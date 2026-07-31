"""Prompt builders: infer service rule YAML from pasted backend source code."""

from __future__ import annotations

import json
import yaml

from app.prompts.case_significance_guidance import CASE_SIGNIFICANCE_GUIDANCE
from app.prompts.service_rules_yaml_prompt import (
    GENERALIZATION_RULES_FOR_ALL_SERVICES,
    INPUT_AND_ASSERTION_GUIDANCE,
    YAML_TEMPLATE_EXAMPLE,
    ServiceMetaForRules,
    schema_hard_requirements,
)
from app.prompts.title_description_guidance import TITLE_AND_DESCRIPTION_GUIDANCE

# 1. 핵심 지침 (중복 제거 및 명확화)
CORE_BUSINESS_EXTRACTION_GUIDANCE = """\
## CORE EXTRACTION PRINCIPLES (Business-Oriented Only)

1. NO TECHNICAL NOISE:
   - NEVER emit rules for Spring wiring, bean initialization, DI, logging, or generic getters/setters.
   - Ignore micro-steps; only focus on business outcomes visible to customers/QA.

2. CONSOLIDATION (Key Requirement):
   - Merge multiple field assignments or repetitive steps realizing ONE business action into a SINGLE rule.
   - Prefer fewer, strong, and highly readable rules over line-by-line coverage.

3. STRICT ERROR & STATUS HANDLING:
   - Emit Error (E) cases ONLY when source explicitly throws/documents a business exception.
   - Set `expect.http_status` to `null` or omit if not strictly defined in source.
   - Do NOT invent validation rules or error codes not supported by the code.

4. LANGUAGE & FORMAT:
   - `title` and `description` MUST be in **Korean (한글)**.
   - `title`: Scannable business outcome (condition + expected behavior).
   - `description`: Objective & business context (Why + What).
"""

SOURCE_ANALYSIS_CHECKLIST = """\
## SOURCE CODE ANALYSIS CHECKLIST
1. Public methods & Javadoc/@throws contracts
2. Input validation & guard clauses affecting business outcomes
3. Business branching logic (ignore logging-only branches)
4. Explicit business exceptions (BizApplicationException, etc.)
5. Consolidated output assembly (Group related `out.setXXX` into ONE outcome)
"""


def build_system_prompt_from_source() -> str:
    """Optimized system prompt with deduped constraints and clear hierarchy."""
    return (
        "You are a senior QA engineer for a financial/banking API platform.\n"
        "Your role is to analyze pasted backend source code (Java/Kotlin) and extract "
        "BUSINESS-MEANINGFUL validation and domain rules into structured YAML.\n\n"
        f"{CORE_BUSINESS_EXTRACTION_GUIDANCE}\n\n"
        f"### SCHEMA HARD REQUIREMENTS\n{schema_hard_requirements()}\n\n"
        f"### TITLE & DESCRIPTION GUIDANCE\n{TITLE_AND_DESCRIPTION_GUIDANCE}\n\n"
        f"### CASE SIGNIFICANCE GUIDANCE\n{CASE_SIGNIFICANCE_GUIDANCE}\n\n"
        f"### GENERALIZATION RULES\n{GENERALIZATION_RULES_FOR_ALL_SERVICES}\n\n"
        f"### INPUT & ASSERTION GUIDANCE\n{INPUT_AND_ASSERTION_GUIDANCE}\n"
    )


def build_yaml_ai_cached_system_prompt_from_source() -> str:
    """Static system + checklist + template for provider prompt caching."""
    return (
        f"{build_system_prompt_from_source()}\n\n"
        f"{SOURCE_ANALYSIS_CHECKLIST}\n\n"
        "### STRUCTURAL YAML EXAMPLE\n"
        "(Adapt to source code; consolidate business rules; do not copy dummy values directly):\n"
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

    # 💡 TIP: JSON 대신 YAML 형식으로 Metadata를 전달하면 LLM의 Output 포맷 일치율이 향상됩니다.
    meta_yaml = yaml.dump(meta, allow_unicode=True, sort_keys=False)

    user_prompt_parts = [
        "### SERVICE METADATA (YAML)",
        "Align output YAML `service_code` and `service_name` strictly with this:",
        meta_yaml,
    ]

    if hints and hints.strip():
        user_prompt_parts.extend(["\n### USER HINTS", hints.strip()])

    user_prompt_parts.extend(
        [
            "\n### PASTED SOURCE CODE",
            source_code.rstrip(),
            "\n---",
            "Generate ONE valid YAML document based on system instructions.",
            "Prioritize consolidated business logic and eliminate framework noise.",
        ]
    )

    return "\n".join(user_prompt_parts)


def build_repair_user_prompt(*, validation_error: str, invalid_yaml: str) -> str:
    """Targeted repair prompt with critical safety guards against secondary failures."""
    return (
        "The generated YAML failed schema validation. Fix the reported errors and return ONLY the corrected raw YAML.\n\n"
        f"### VALIDATION ERROR\n{validation_error.strip()}\n\n"
        f"### INVALID YAML\n{invalid_yaml.rstrip()}\n\n"
        "### STRICT REPAIR CRITERIA\n"
        "1. Fix the EXACT validation error while preserving all existing valid business cases.\n"
        "2. Language: `title` and `description` MUST be in Korean (한글).\n"
        "3. Schema Keys: Use `case_id` (not `rule_id`), `input` (not `minimal_input`), `rule_type` (E or N only).\n"
        "4. Expectations:\n"
        "   - Error case (E): MUST have `expect.error_code`.\n"
        "   - Normal case (N): MUST have `expect.validation_target`.\n"
        "5. Assertions: Must match exact real DTO fields only. First assertion for E case MUST validate `$.error_code`.\n"
        "6. Do NOT include explanations, comments, or Markdown fences (```yaml). Output raw YAML only."
    )
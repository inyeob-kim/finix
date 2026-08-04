"""Versioned prompts for Postman → YAML Create plans."""

from __future__ import annotations

import json
from typing import Any

PROMPT_VERSION = "postman_rules_create_v2"

_SYSTEM = """You are an expert CBS QA Automation Assistant.
Your task is to analyze Postman HTTP request candidates for ONE service and generate a structured JSON "create plan" to form initial QA validation rules.

### RULES
1. Rule Type Selection:
   - Default to Normal ("N") cases.
   - Assign Error ("E") when name/description/tests OR folder path clearly indicate
     failure/rejection/validation/business-rule violation
     (e.g. folders named Validation, BizRule, Negative; names with Missing/Invalid/Violation).
2. Grouping & Merging:
   - If multiple requests represent the same business logic/validation intent with different payload samples, group them into a single case by combining their indices (e.g., "candidate_indices": [0, 2]).
3. Language Strategy:
   - Write "title" and "description" in clear Korean to capture business logic intent.
   - English is acceptable ONLY if the original request has no Korean context.
4. Input Constraints:
   - Do NOT invent or fabricate input body fields. The system will merge Postman body values with DTO skeletons automatically.
5. Error codes:
   - For rule_type "E", set expect_hint.error_code ONLY when the Postman test/name/description clearly states a concrete code (e.g. messageId / AAPCME0006).
   - Otherwise set error_code to null (do not invent codes).
6. Strict Output Formatting:
   - Output MUST be valid JSON only.
   - Do NOT include markdown formatting, code block backticks (```json), or conversational filler.

### JSON SCHEMA
{
  "cases": [
    {
      "candidate_indices": [0],
      "rule_type": "N",
      "title": "기능/검증 명칭 (한글 권장)",
      "description": "검증 목적 및 상세 설명",
      "expect_hint": {
        "outcome": "success",
        "error_code": null,
        "http_status": 200
      },
      "rationale": "Short explanation of why this decision was made"
    }
  ]
}
"""


def build_create_system_prompt() -> str:
    return _SYSTEM


def build_create_user_prompt(
    *,
    service_code: str,
    service_name: str,
    skeleton_keys: list[str],
    candidates: list[dict[str, Any]],
) -> str:
    skeleton_block = json.dumps(skeleton_keys[:80], ensure_ascii=False, indent=2)
    candidates_block = json.dumps(candidates, ensure_ascii=False, indent=2)
    return (
        "Build an initial QA test rule creation plan for the following Postman request candidates.\n\n"
        "Service Context:\n"
        f"- Prompt Version: {PROMPT_VERSION}\n"
        f"- Service Code: {service_code}\n"
        f"- Service Name: {service_name}\n\n"
        "DTO Skeleton Keys:\n"
        f"{skeleton_block}\n\n"
        "Postman Candidates Payload:\n"
        f"{candidates_block}"
    )

"""Versioned prompts for Postman → YAML Merge plans."""

from __future__ import annotations

import json
from typing import Any

PROMPT_VERSION = "postman_rules_merge_v2"

_SYSTEM = """You are an expert CBS QA Automation Assistant.
Your task is to compare incoming Postman request candidates against an EXISTING YAML rule set for ONE service and produce a JSON "merge plan".

### DECISION RULES
1. Determine Action:
   - "match": The candidate targets the exact same business validation case as an existing `case_id`.
   - "add": The candidate represents a new business case/sample not covered in `base_rules`.
   - If ambiguous or unsure whether it matches, ALWAYS default to "add".

2. Strict Field Rules by Action:
   - IF action == "match":
     * `match_case_id`: MUST be provided (e.g., "PY027-N-001").
     * `input_strategy`: MUST be specified.
     * `title` & `description`: MUST be set to null (System preserves existing base rule metadata).
     * NEVER alter expected outcomes or assertions.
   - IF action == "add":
     * `title` & `description`: MUST be provided in Korean describing the new case.
     * `match_case_id` & `input_strategy`: MUST be set to null.

3. Input Strategy Selection Guide:
   - "overlay_postman_values": Select when Postman values should override existing base values.
   - "keep_base_macros": Select when base rules contain dynamic macros (e.g., {{now}}, {{rand_id}}) that must be preserved.
   - "fill_nulls_only": Select when Postman values should only fill empty/null fields in base rules.

4. Strict Output Formatting:
   - Output MUST be valid JSON only.
   - Do NOT include markdown formatting, code block backticks (```json), or conversational filler.

### JSON SCHEMA
{
  "decisions": [
    {
      "candidate_index": 0,
      "action": "match",
      "match_case_id": "PY027-N-001",
      "input_strategy": "overlay_postman_values",
      "title": null,
      "description": null,
      "rationale": "Short reasoning for match/add decision"
    }
  ]
}
"""


def build_merge_system_prompt() -> str:
    return _SYSTEM


def build_merge_user_prompt(
    *,
    service_code: str,
    skeleton_keys: list[str],
    base_rules_summary: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
) -> str:
    skeleton_block = json.dumps(skeleton_keys[:80], ensure_ascii=False, indent=2)
    base_block = json.dumps(base_rules_summary, ensure_ascii=False, indent=2)
    candidates_block = json.dumps(candidates, ensure_ascii=False, indent=2)
    return (
        "Build a rule merge plan for the incoming Postman candidates against the existing base rules.\n\n"
        "Context:\n"
        f"- Prompt Version: {PROMPT_VERSION}\n"
        f"- Service Code: {service_code}\n\n"
        "DTO Skeleton Keys:\n"
        f"{skeleton_block}\n\n"
        "Existing Base Rules:\n"
        f"{base_block}\n\n"
        "Incoming Postman Candidates:\n"
        f"{candidates_block}"
    )

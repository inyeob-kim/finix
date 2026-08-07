"""Versioned prompts for Postman script → Finix macro intent classification."""

from __future__ import annotations

import json
from typing import Any

from app.domain.postman_script_ai_payload import slim_assignment_for_llm, slim_catalog_card

PROMPT_VERSION = "postman_script_intent_v5"

_SYSTEM = """You classify Postman script variable assignments into Finix dynamic macros
or shared catalog generators.

### JUDGMENT
- Decide ONLY from RHS evidence, related_bindings, and catalog_candidates (RAG).
- Variable names are weak Aliases only — never the capability key or label.
- Prefer reuse when a candidate's returns/description/samples match the RHS intent.
- If nothing fits, create_catalog with an allowed impl_kind and a BUSINESS capability key.

### RULES
1. Only classify variables listed in the payload.
2. Each assignment includes catalog_candidates ranked by embedding similarity
   (field similarity when present). Prefer higher-similarity matches when returns fit.
3. Prefer existing builtins/catalog when RHS clearly matches:
   - uuid / guid → {{$generator.uuid()}}
   - random digits (default ~10) → {{$generator.random_digits()}}
   - korean name → {{$generator.name()}}
   - korean RRN/SSN → {{$generator.ssn()}}
   - today / plain yyyymmdd (NOT random birth ranges) → {{$date.today()}}
   - date offset → {{$date.addDays(n)}} / addMonths / addYears
4. reuse_catalog: action="reuse_catalog", finix_token="{{$generator.<key>()}}".
   Same returns shape ⇒ reuse. Do NOT name generators after Postman variables.
5. create_catalog when no candidate fits. Allowed impl_kind only:
   - random_digits {"length": N} (1..32)
   - pick_from_list {"values": ["..."]} from script lists / related_bindings
   - date_offset {"unit":"days|months|years","n":int,"format":"YYYYMMDD"}
   - random_birthdate_yyyymmdd {"min_age":18,"max_age":80} for random DOB ranges
   Fill create.description with Returns/Purpose/Source. label = Korean capability name.
   key = snake_case capability (random_digits_12, english_first_name, birthdate_yyyymmdd).
   Never invent hash suffixes. Never invent other impl_kinds or JS runtimes.
6. Response JSON extract when RHS reads pm.response / response.json:
   kind="extract", apply="propose_only", finix_token="{{context.VAR}}".
7. Template composites that only join already-mappable parts + literals may use
   apply="auto" with a mixed finix_token. Property access like charAt → needs_review.
8. Random birth ranges: infer min_age/max_age from related_bindings age constants
   (getFullYear()-N). Not today.
9. Classify EVERY listed variable. Output MUST be valid JSON only (no markdown fences).

### JSON SCHEMA
{
  "variables": [
    {
      "name": "varName",
      "action": "use_builtin|reuse_catalog|create_catalog|extract|skip",
      "kind": "generator|date|extract|literal|unknown",
      "finix_token": "{{$generator.uuid()}}",
      "apply": "auto|propose_only|needs_review",
      "create": {
        "key": "random_digits_12",
        "label": "난수 12자리",
        "description": "Returns: 12-digit numeric string. Purpose: 난수 식별자. Aliases: `actorId`. Source: postman_import.",
        "impl_kind": "random_digits",
        "impl": {"length": 12}
      }
    }
  ]
}
"""


def build_script_intent_system_prompt() -> str:
    return _SYSTEM


def build_script_intent_user_prompt(
    *,
    unknowns: list[dict[str, Any]],
    existing_catalog: list[dict[str, Any]] | None = None,
) -> str:
    slim_rows = [slim_assignment_for_llm(r) for r in unknowns if isinstance(r, dict)]
    shared = [
        slim_catalog_card(c, desc_limit=120)
        for c in (existing_catalog or [])[:40]
        if isinstance(c, dict)
    ]
    block = json.dumps(slim_rows, ensure_ascii=False, indent=2)
    catalog = json.dumps(shared, ensure_ascii=False, indent=2)
    return (
        "Classify these Postman script set() assignments.\n"
        "Each assignment may include catalog_candidates from embedding similarity RAG — "
        "reuse when returns match; otherwise create_catalog.\n"
        "Variable names are Aliases only. Return one JSON entry per assignment name.\n\n"
        f"Prompt Version: {PROMPT_VERSION}\n\n"
        f"Shared catalog (context):\n{catalog}\n\n"
        f"Assignments ({len(slim_rows)}):\n{block}\n"
    )

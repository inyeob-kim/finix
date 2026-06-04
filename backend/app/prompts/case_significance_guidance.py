"""Rules and validation: every YAML case must have clear business significance."""

from __future__ import annotations

import re
from typing import Any

CASE_SIGNIFICANCE_GUIDANCE = """\
Case significance (CRITICAL — quality over quantity):

Every rule MUST justify its existence as an independent business test scenario.
If removing the case would NOT miss a distinct business regression, do NOT include it.

DO NOT emit cases for:
- Simple output assembly with no distinct business branch (mechanical out.set / field copy only)
- One case per setter or per out.setXXX line
- Padding the rule list to reach a target count
- Generic "success path" whose only proof is not_null on response fields
- Duplicating the same business outcome already covered by another case

DO emit cases for:
- Input/required-field/format validation with evidenced rejection (E)
- Documented business exceptions and domain guard clauses (E)
- Business rules with clear pass/fail (limits, dates, status, duplicates, eligibility) (E or N)
- Normal (N) paths that describe a user-visible business outcome (registration, inquiry result,
  approval, cancellation, list reconciliation) — not "fields were populated"
- Output behavior tied to a branch, loop, or domain rule (e.g. one result row per input item,
  different response when status changes)

Normal case (N) consolidation:
- Merge mechanical output mapping into ONE representative success case for the main happy path.
- Add a separate N only when the source shows a different business outcome or branch worth testing.
- Prefer fewer, stronger cases over many weak micro-cases.

Volume:
- There is NO required total case count. Do NOT add cases to fill a quota.
- Include E and N types when the service actually has evidenced error and success behaviors.
- A small service with 3–6 strong cases is better than 15 trivial ones.

Self-check before final YAML:
- Would a business user agree each case tests a different scenario?
- Can you state the condition and expected business outcome in the title without saying "output assembly"?
- If the only evidence is consecutive out.set lines with no branch, merge or omit.
"""

# Title / validation_target phrases that indicate low-value filler (substring match).
_LOW_VALUE_TITLE_PHRASES: tuple[str, ...] = (
    "output assembly",
    "transaction output assembly",
    "output field assembly",
    "successful processing populates",
    "populates observable",
    "fields are set",
    "response fields are populated",
    "observable transaction fields",
    "transaction output",
)

_LOW_VALUE_VALIDATION_TARGET_PHRASES: tuple[str, ...] = (
    "fields are populated",
    "observable transaction fields are populated",
    "transaction date/time fields are populated",
    "successful processing populates",
    "output assembly",
)

_TRIVIAL_ASSERTION_OPS = frozenset({"not_null", "not_empty", "exists"})

_BUSINESS_SNIPPET_MARKERS: tuple[str, ...] = (
    "if ",
    "throw",
    "exception",
    "for ",
    "while ",
    "validate",
    "reject",
    "bizapplication",
    "error",
    "return ",
    "?",
)


def _normalize(text: str) -> str:
    return " ".join((text or "").split()).strip().lower()


def _assertions_are_trivial_only(assertions: list[Any]) -> bool:
    if not assertions:
        return True
    for item in assertions:
        if not isinstance(item, dict):
            return False
        op = str(item.get("op") or "").strip().lower()
        if op not in _TRIVIAL_ASSERTION_OPS:
            return False
    return True


def _snippet_is_trivial_output_only(snippet: str) -> bool:
    """True when snippet looks like bare out.set* mapping without control flow."""
    s = (snippet or "").strip().lower()
    if not s:
        return False
    if "out.set" not in s and ".set" not in s:
        return False
    return not any(marker in s for marker in _BUSINESS_SNIPPET_MARKERS)


def is_low_value_case(rule: dict[str, Any]) -> bool:
    """
    Heuristic: True when a rule is likely implementation-noise, not a business scenario.

    Used at validate/save boundaries and LLM repair loops.
    """
    rtype = str(rule.get("rule_type") or "").strip().upper()
    if rtype != "N":
        return False

    title = _normalize(str(rule.get("title") or ""))
    desc = _normalize(str(rule.get("description") or ""))
    expect = rule.get("expect") if isinstance(rule.get("expect"), dict) else {}
    vt = _normalize(str(expect.get("validation_target") or ""))
    snippet = str(
        (rule.get("source_evidence") or {}).get("snippet")
        if isinstance(rule.get("source_evidence"), dict)
        else ""
    )
    assertions = rule.get("assertions")
    assertions_list = assertions if isinstance(assertions, list) else []

    title_generic = any(p in title for p in _LOW_VALUE_TITLE_PHRASES)
    vt_generic = any(p in vt for p in _LOW_VALUE_VALIDATION_TARGET_PHRASES)
    trivial_assertions = _assertions_are_trivial_only(assertions_list)
    trivial_snippet = _snippet_is_trivial_output_only(snippet)

    # List/count business outcomes are allowed when title/description state business intent.
    list_business = any(
        kw in title or kw in desc or kw in vt
        for kw in (
            "per input",
            "per submitted",
            "per account",
            "one result",
            "list size",
            "each registration",
            "each item",
            "reconcile",
            "schedule",
            "repayment",
            "inquiry returns",
            "registration returns",
            "cancellation",
            "transfer returns",
        )
    )
    if list_business:
        return False

    if title_generic:
        return True

    if vt_generic and trivial_assertions and (trivial_snippet or len(assertions_list) <= 2):
        return True

    if trivial_snippet and trivial_assertions and not assertions_list:
        return False

    if trivial_snippet and trivial_assertions and len(assertions_list) <= 3:
        if vt_generic or len(title) < 40:
            return True

    return False


def validate_rule_case_significance(*, idx: int, rule: dict[str, Any]) -> None:
    """Raise InvalidInputError when a rule lacks independent business significance."""
    from app.core.exceptions import InvalidInputError

    if not is_low_value_case(rule):
        return
    title = str(rule.get("title") or "").strip()
    raise InvalidInputError(
        f"rules[{idx}].title «{title}» — 업무 시나리오 가치가 낮습니다. "
        "단순 출력 조립·필드 not_null 확인만으로는 케이스를 만들지 마세요. "
        "분기·업무 규칙·사용자에게 보이는 결과가 있는 경우만 N 케이스로 두거나, "
        "기계적 out.set 매핑은 대표 성공 경로 하나에 병합하세요."
    )

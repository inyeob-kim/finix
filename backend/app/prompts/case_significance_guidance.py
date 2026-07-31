"""Rules and validation: every YAML case must have clear business significance."""

from __future__ import annotations

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
    "거래 출력 조립",
    "관측 가능한 거래 필드",
    "응답 필드를 채운다",
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

# Titles that name a distinct user/business outcome — do not treat as filler N.
_BUSINESS_OUTCOME_MARKERS: tuple[str, ...] = (
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
    "제출 계좌마다",
    "결과 행",
    "목록 크기",
    "상환스케줄",
    "대사",
    "해지",
    "취소",
    "등록",
    "조회",
    "승인",
    "거절",
    "자동이체",
    "약정",
    "이체",
    "상환",
    "처리된다",
    "반환한다",
    "요청이",
    "성공적",
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


def _has_business_outcome_signal(*texts: str) -> bool:
    for raw in texts:
        t = _normalize(raw)
        if not t:
            continue
        if any(kw in t for kw in _BUSINESS_OUTCOME_MARKERS):
            return True
    return False


def is_low_value_case(rule: dict[str, Any]) -> bool:
    """
    Heuristic: True when a rule is likely implementation-noise, not a business scenario.

    Used at validate/save boundaries and LLM repair loops.
    Low-value Normal cases should be dropped, not fail the whole YAML document.
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
    business_signal = _has_business_outcome_signal(title, desc, vt)

    # Concrete business outcomes are never treated as filler, even if evidence is out.set-heavy.
    if business_signal and not title_generic:
        return False

    if title_generic:
        return True

    if vt_generic and trivial_assertions and (trivial_snippet or len(assertions_list) <= 2):
        return True

    if trivial_snippet and trivial_assertions and not assertions_list:
        return False

    if trivial_snippet and trivial_assertions and len(assertions_list) <= 3:
        if vt_generic:
            return True
        # Short English/generic titles without business markers only.
        if len(title) < 40 and not business_signal:
            return True

    return False


def validate_rule_case_significance(*, idx: int, rule: dict[str, Any]) -> None:
    """
    Raise InvalidInputError when a rule lacks independent business significance.

    Prefer dropping via is_low_value_case during validate_and_prepare_yaml;
    this remains for explicit callers/tests.
    """
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

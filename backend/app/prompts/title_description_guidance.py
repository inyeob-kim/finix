"""Shared LLM + validation guidance for rule title and description quality."""

from __future__ import annotations

import re

TITLE_AND_DESCRIPTION_GUIDANCE = """\
Title and description quality (CRITICAL for case list usability):

Quality goal:
- A business user must understand each case from case_id + title alone, without opening YAML.
- Descriptions explain WHY the case exists; titles state WHAT is tested and WHAT outcome is expected.

TITLE rules — every title MUST be:
- Human-readable, business-oriented, actionable, and specific
- Understandable in a testcase list scan (not only inside YAML details)

Do NOT use vague titles such as:
- "Validation of customer information"
- "Business rule enforcement"
- "Field validation"
- "Transaction processing"
- "Transaction output assembly"
- "Input validation" / "Required field" without business context

Preferred patterns:
- Error (E): state the business condition AND the rejection outcome
  - Missing arrangement ID returns validation error
  - Invalid transfer amount exceeds daily limit
  - Closed account cannot register auto transfer
  - Duplicate customer ID is rejected
- Normal (N): state the business action AND the successful outcome
  - Auto transfer registration returns success response
  - Loan inquiry returns repayment schedule list
  - Deposit account creation stores customer information
  - Account inquiry includes available balance

Field name rule:
- Do NOT use raw DTO/Java field names as the primary title (e.g. pymntDt, arrIdNbr, ATR).
- Translate to business language: "Missing payment date prevents transfer request" not "Validation of pymntDt".

DESCRIPTION rules — every description MUST:
- Explain why the case exists and what business condition is validated
- State what behavior the service should perform on success or failure
- Be concise but meaningful; use business language
- NOT repeat the title word-for-word (expand with context, trigger, and domain meaning)

Good description examples:
- "The service rejects the request when arrangement ID is missing because the arrangement is required for transfer cancellation."
- "The service returns repayment schedule information for the requested loan account."
- "The service prevents duplicate registration for the same customer and account combination."

Source analysis (when inferring from code):
- Infer business intent from validation logic, exceptions, and branches — not setter names alone
- Prefer business terminology over implementation terminology
- Consolidate multiple low-level checks into one cohesive business scenario with one title/description pair

Fallback when intent is unclear:
- Use the most user-understandable explanation possible
- Avoid framework/DI/internal wording in title and description
"""

# Substrings (lowercase) that indicate an unacceptably generic title.
_VAGUE_TITLE_SUBSTRINGS: tuple[str, ...] = (
    "validation of customer information",
    "business rule enforcement",
    "field validation",
    "transaction processing",
    "transaction output assembly",
    "business constraint visible",
    "validation failure",
    "required field validation",
    "input validation",
    "customer information is invalid",
    "successful processing populates",
    "successful processing returns",
    "enforce business constraint",
    "observable transaction fields",
)

# Title looks like "Validation of pymntDt" or "accountNo required"
_FIELD_ORIENTED_TITLE_RE = re.compile(
    r"^(?:validation of|missing|invalid|required)\s+[a-z][a-zA-Z0-9]{1,40}$",
    re.IGNORECASE,
)
_CAMEL_FIELD_ONLY_RE = re.compile(
    r"^[a-z][a-zA-Z0-9]{2,30}\s+(?:is\s+)?(?:required|validation|missing|invalid)$",
    re.IGNORECASE,
)

_MIN_TITLE_LEN = 12
_MIN_DESCRIPTION_LEN = 24


def _normalize_text(value: str) -> str:
    return " ".join((value or "").split()).strip()


def is_vague_title(title: str) -> bool:
    """True when title matches known generic or field-only patterns."""
    t = _normalize_text(title).lower()
    if not t:
        return True
    if len(t) < _MIN_TITLE_LEN:
        return True
    if any(phrase in t for phrase in _VAGUE_TITLE_SUBSTRINGS):
        return True
    if _FIELD_ORIENTED_TITLE_RE.match(t):
        return True
    if _CAMEL_FIELD_ONLY_RE.match(t):
        return True
    return False


def validate_rule_title_description(
    *,
    idx: int,
    title: str,
    description: str,
) -> None:
    """
    Raise InvalidInputError when title/description fail quality checks.

    Used at YAML validate/save boundaries so LLM repair loops get actionable errors.
    """
    from app.core.exceptions import InvalidInputError

    t = _normalize_text(title)
    d = _normalize_text(description)

    if not t:
        raise InvalidInputError(f"rules[{idx}].title이 필요합니다.")
    if not d:
        raise InvalidInputError(f"rules[{idx}].description이 필요합니다.")

    if len(t) < _MIN_TITLE_LEN:
        raise InvalidInputError(
            f"rules[{idx}].title이 너무 짧습니다. 비즈니스 조건과 기대 결과를 담은 "
            f"구체적인 문장으로 작성하세요 (최소 {_MIN_TITLE_LEN}자)."
        )
    if len(d) < _MIN_DESCRIPTION_LEN:
        raise InvalidInputError(
            f"rules[{idx}].description이 너무 짧습니다. 케이스 목적과 검증 이유를 "
            f"설명하세요 (최소 {_MIN_DESCRIPTION_LEN}자)."
        )

    if is_vague_title(t):
        raise InvalidInputError(
            f"rules[{idx}].title이 모호하거나 필드 중심입니다: «{t}». "
            "비즈니스 조건과 기대 결과(거절/성공)를 명확히 적으세요. "
            "예: «Missing payment date prevents transfer request», "
            "«Loan inquiry returns repayment schedule list»."
        )

    if t.lower() == d.lower():
        raise InvalidInputError(
            f"rules[{idx}].description은 title과 동일할 수 없습니다. "
            "왜 이 케이스가 필요한지, 어떤 업무 조건을 검증하는지 추가로 설명하세요."
        )

    if d.lower().startswith(t.lower()) and len(d) - len(t) < 15:
        raise InvalidInputError(
            f"rules[{idx}].description이 title을 거의 반복합니다. "
            "업무 맥락·거절/성공 동작을 description에 구체적으로 작성하세요."
        )

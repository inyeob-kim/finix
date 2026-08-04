"""Shared LLM + validation guidance for rule title and description quality."""

from __future__ import annotations

import re

TITLE_AND_DESCRIPTION_GUIDANCE = """\
Title and description quality (CRITICAL for case list usability):

Language (preferred, not schema-enforced):
- Prefer Korean (한글) title/description so business users can scan case lists easily.
- English is acceptable when the source material is English-only; still write a clear business outcome.
- Keep technical identifiers as-is when needed (case_id, error_code, DTO/Java field names in evidence).

Quality goal:
- A business user must understand each case from case_id + title alone, without opening YAML.
- Descriptions explain WHY the case exists; titles state WHAT is tested and WHAT outcome is expected.

TITLE rules — every title MUST be:
- Human-readable, business-oriented, actionable, and specific
- Understandable in a testcase list scan (not only inside YAML details)

Do NOT use vague titles such as:
- "고객 정보 검증"
- "업무 규칙 적용"
- "필드 검증"
- "거래 처리"
- "거래 출력 조립"
- 맥락 없는 "입력 검증" / "필수값 검증"
- Generic English labels (e.g. "Field validation", "Business rule enforcement")

Preferred patterns (Korean examples; English equivalents OK):
- Error (E): 업무 조건 + 거절/오류 결과
  - 약정 ID 누락 시 검증 오류를 반환한다
  - 이체 금액이 일일한도를 초과하면 거절된다
  - 해지된 계좌는 자동이체 등록이 불가하다
  - 중복 고객 ID는 거절된다
- Normal (N): 업무 동작 + 성공 결과
  - 자동이체 등록 성공 응답을 반환한다
  - 대출 조회 시 상환스케줄 목록을 반환한다
  - 수신계좌 개설 시 고객정보를 저장한다
  - 계좌 조회 응답에 가용잔액이 포함된다

Field name rule:
- Do NOT use raw DTO/Java field names as the primary title (e.g. pymntDt, arrIdNbr, ATR).
- Prefer business language over field codes:
  - Good: "지급일이 없으면 이체 요청이 거절된다"
  - Bad: "Validation of pymntDt" / "pymntDt 검증"

DESCRIPTION rules — every description MUST:
- Explain why the case exists and what business condition is validated
- State what behavior the service should perform on success or failure
- Be concise but meaningful; use business language
- NOT repeat the title word-for-word (expand with context, trigger, and domain meaning)

Good description examples:
- "약정 ID가 없으면 이체 해지에 필요한 대상을 특정할 수 없어 요청을 거절한다."
- "요청한 대출계좌의 상환스케줄 정보를 응답으로 반환한다."
- "동일 고객·계좌 조합의 중복 등록을 차단한다."

Source analysis (when inferring from code):
- Infer business intent from validation logic, exceptions, and branches — not setter names alone
- Prefer Korean business terminology when the domain language is Korean
- Consolidate multiple low-level checks into one cohesive business scenario with one title/description pair

Fallback when intent is unclear:
- Use the most user-understandable business explanation possible
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
    "고객 정보 검증",
    "업무 규칙 적용",
    "필드 검증",
    "거래 처리",
    "거래 출력 조립",
    "입력 검증",
    "필수값 검증",
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
_HANGUL_RE = re.compile(r"[가-힣]")

_MIN_TITLE_LEN = 12
_MIN_DESCRIPTION_LEN = 24


def _normalize_text(value: str) -> str:
    return " ".join((value or "").split()).strip()


def has_hangul(text: str) -> bool:
    return bool(_HANGUL_RE.search(text or ""))


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
    No-op for save/validate boundaries.

    Title/description content quality lives in prompt guidance only.
    Schema validation checks non-empty title/description elsewhere.
    """
    _ = (idx, title, description)
    return

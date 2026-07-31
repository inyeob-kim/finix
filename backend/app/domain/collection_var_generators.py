"""Built-in generators for scenario collection variables (run-once resolve)."""

from __future__ import annotations

import random
import re
import uuid
from typing import Any

from app.domain.postman_default_headers import fcc_tx_date_today

# Keep in sync with frontend COLLECTION_VAR_GENERATORS.
GENERATOR_IDS = frozenset(
    {
        "today_yyyymmdd",
        "uuid",
        "random_digits",
        "korean_name",
        "korean_rrn",
    },
)

_KOREAN_SURNAMES = (
    "김",
    "이",
    "박",
    "최",
    "정",
    "강",
    "조",
    "윤",
    "장",
    "임",
    "한",
    "오",
    "서",
    "신",
    "권",
    "황",
    "안",
    "송",
    "전",
    "홍",
)

_KOREAN_GIVEN = (
    "민준",
    "서연",
    "예준",
    "서윤",
    "도윤",
    "지우",
    "하준",
    "서준",
    "주원",
    "지민",
    "수아",
    "하은",
    "지아",
    "유진",
    "예은",
    "시우",
    "준서",
    "현우",
    "지훈",
    "수빈",
)

_GENERATOR_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def normalize_generator_id(raw: str | None) -> str | None:
    g = (raw or "").strip().lower()
    if not g or g == "literal":
        return None
    if g not in GENERATOR_IDS:
        return None
    return g


def _random_digits(length: int = 10) -> str:
    n = max(1, min(32, int(length)))
    return "".join(str(random.randint(0, 9)) for _ in range(n))


def _korean_name() -> str:
    return random.choice(_KOREAN_SURNAMES) + random.choice(_KOREAN_GIVEN)


def _rrn_check_digit(body12: str) -> str:
    weights = (2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5)
    total = sum(int(d) * w for d, w in zip(body12, weights, strict=True))
    return str((11 - (total % 11)) % 10)


def _korean_rrn() -> str:
    """Synthetic RRN for test data (not a real person)."""
    yy = random.randint(70, 99)
    mm = random.randint(1, 12)
    dd = random.randint(1, 28)
    century_sex = random.choice((1, 2))  # 1900s
    region = random.randint(0, 99999)
    body12 = f"{yy:02d}{mm:02d}{dd:02d}{century_sex}{region:05d}"
    return body12 + _rrn_check_digit(body12)


def resolve_generator(generator: str | None, *, params: dict[str, Any] | None = None) -> str:
    """Evaluate a built-in generator once (per scenario run)."""
    g = normalize_generator_id(generator)
    if g is None:
        return ""
    p = params or {}
    if g == "today_yyyymmdd":
        return fcc_tx_date_today()
    if g == "uuid":
        return str(uuid.uuid4())
    if g == "random_digits":
        return _random_digits(int(p.get("length") or 10))
    if g == "korean_name":
        return _korean_name()
    if g == "korean_rrn":
        return _korean_rrn()
    return ""


def resolve_start_var_value(
    *,
    value: str,
    generator: str | None,
) -> str:
    """Literal value wins when no generator; otherwise generate."""
    g = normalize_generator_id(generator)
    if g:
        return resolve_generator(g)
    return value

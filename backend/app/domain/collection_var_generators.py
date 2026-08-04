"""Built-in + catalog-backed generators for scenario collection variables."""

from __future__ import annotations

import calendar
import json
import random
import re
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from app.domain.postman_default_headers import fcc_tx_date_today

# Keep in sync with frontend builtin ids.
GENERATOR_IDS = frozenset(
    {
        "today_yyyymmdd",
        "uuid",
        "random_digits",
        "korean_name",
        "korean_rrn",
    },
)

BUILTIN_META: tuple[tuple[str, str, str], ...] = (
    ("today_yyyymmdd", "오늘 날짜", "YYYYMMDD · 실행 시점 시스템 날짜"),
    ("uuid", "UUID", "실행마다 새 UUID"),
    ("random_digits", "난수 숫자", "10자리 숫자"),
    ("korean_name", "한글 이름", "테스트용 성+이름"),
    ("korean_rrn", "주민번호", "테스트용 합성 주민번호"),
)

_KOREAN_SURNAMES = (
    "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임",
    "한", "오", "서", "신", "권", "황", "안", "송", "전", "홍",
)

_KOREAN_GIVEN = (
    "민준", "서연", "예준", "서윤", "도윤", "지우", "하준", "서준", "주원", "지민",
    "수아", "하은", "지아", "유진", "예은", "시우", "준서", "현우", "지훈", "수빈",
)

_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{1,62}$")
_ALLOWED_IMPL_KINDS = frozenset(
    {
        "date_offset",
        "random_digits",
        "uuid",
        "korean_name",
        "korean_rrn",
        "today_yyyymmdd",
    },
)


@dataclass(frozen=True, slots=True)
class CatalogGeneratorSpec:
    key: str
    impl_kind: str
    impl: dict[str, Any]


def is_valid_generator_key(key: str) -> bool:
    return bool(_KEY_RE.match((key or "").strip()))


def normalize_builtin_id(raw: str | None) -> str | None:
    g = (raw or "").strip().lower()
    if not g or g == "literal":
        return None
    if g not in GENERATOR_IDS:
        return None
    return g


def normalize_generator_id(raw: str | None) -> str | None:
    """Backward-compatible alias for builtins only."""
    return normalize_builtin_id(raw)


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
    yy = random.randint(70, 99)
    mm = random.randint(1, 12)
    dd = random.randint(1, 28)
    century_sex = random.choice((1, 2))
    region = random.randint(0, 99999)
    body12 = f"{yy:02d}{mm:02d}{dd:02d}{century_sex}{region:05d}"
    return body12 + _rrn_check_digit(body12)


def _format_date(d: date, fmt: str) -> str:
    f = (fmt or "YYYYMMDD").upper()
    if f == "YYYY-MM-DD":
        return d.strftime("%Y-%m-%d")
    return d.strftime("%Y%m%d")


def _add_months(base: date, months: int) -> date:
    total = base.year * 12 + (base.month - 1) + months
    year, month0 = divmod(total, 12)
    month = month0 + 1
    last = calendar.monthrange(year, month)[1]
    day = min(base.day, last)
    return date(year, month, day)


def _add_years(base: date, years: int) -> date:
    return _add_months(base, years * 12)


def resolve_date_offset(impl: dict[str, Any]) -> str:
    unit = str(impl.get("unit") or "days").lower()
    try:
        n = int(impl.get("n", 0))
    except (TypeError, ValueError):
        n = 0
    n = max(-3650, min(3650, n))
    fmt = str(impl.get("format") or "YYYYMMDD")
    base = date.today()
    if unit in ("month", "months"):
        out = _add_months(base, n)
    elif unit in ("year", "years"):
        out = _add_years(base, n)
    else:
        out = base + timedelta(days=n)
    return _format_date(out, fmt)


def resolve_generator(generator: str | None, *, params: dict[str, Any] | None = None) -> str:
    """Evaluate a built-in generator once (per scenario run)."""
    g = normalize_builtin_id(generator)
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


def resolve_catalog_spec(spec: CatalogGeneratorSpec) -> str:
    kind = (spec.impl_kind or "").strip().lower()
    impl = spec.impl or {}
    if kind == "date_offset":
        return resolve_date_offset(impl)
    if kind == "random_digits":
        return _random_digits(int(impl.get("length") or 10))
    if kind in ("uuid", "today_yyyymmdd", "korean_name", "korean_rrn"):
        return resolve_generator(kind, params=impl)
    return ""


def resolve_start_var_value(
    *,
    value: str,
    generator: str | None,
    catalog: dict[str, CatalogGeneratorSpec] | None = None,
) -> str:
    """Resolve literal or generator (builtin / DB catalog)."""
    g = (generator or "").strip()
    if not g:
        return value
    builtin = normalize_builtin_id(g)
    if builtin:
        return resolve_generator(builtin)
    if catalog and g in catalog:
        return resolve_catalog_spec(catalog[g])
    return value


def validate_custom_impl(impl_kind: str, impl: dict[str, Any]) -> dict[str, Any]:
    """Normalize and validate AI/custom impl; raises ValueError."""
    kind = (impl_kind or "").strip().lower()
    if kind not in _ALLOWED_IMPL_KINDS:
        raise ValueError(f"지원하지 않는 impl_kind: {impl_kind}")
    if kind == "date_offset":
        unit = str(impl.get("unit") or "months").lower()
        if unit in ("month", "months"):
            unit = "months"
        elif unit in ("year", "years"):
            unit = "years"
        else:
            unit = "days"
        try:
            n = int(impl.get("n", 0))
        except (TypeError, ValueError) as exc:
            raise ValueError("date_offset.n 이 숫자가 아닙니다.") from exc
        fmt = str(impl.get("format") or "YYYYMMDD").upper()
        if fmt not in ("YYYYMMDD", "YYYY-MM-DD"):
            fmt = "YYYYMMDD"
        return {"unit": unit, "n": max(-3650, min(3650, n)), "format": fmt}
    if kind == "random_digits":
        try:
            length = int(impl.get("length") or 10)
        except (TypeError, ValueError) as exc:
            raise ValueError("random_digits.length 가 숫자가 아닙니다.") from exc
        return {"length": max(1, min(32, length))}
    return {}


def parse_impl_json(raw: str | None) -> dict[str, Any]:
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}

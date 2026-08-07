"""Built-in + catalog-backed generators for scenario collection variables."""

from __future__ import annotations

import calendar
import hashlib
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
    ("korean_name", "한글 이름", "테스트용 성+이름 · 성/이름/미들 선택 가능"),
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
        "random_birthdate_yyyymmdd",
        "uuid",
        "korean_name",
        "korean_rrn",
        "today_yyyymmdd",
        "pick_from_list",
    },
)

_PICK_LIST_MIN = 2
_PICK_LIST_MAX = 200
_PICK_LIST_ITEM_MAX = 128


def _pick_from_list(values: list[str]) -> str:
    if not values:
        return ""
    return random.choice(values)


@dataclass(frozen=True, slots=True)
class CatalogGeneratorSpec:
    key: str
    impl_kind: str
    impl: dict[str, Any]


def is_valid_generator_key(key: str) -> bool:
    return bool(_KEY_RE.match((key or "").strip()))


_HANGUL_RE = re.compile(r"[가-힣]")
_CAMEL_RE = re.compile(r"^[a-z]+(?:[A-Z][a-z0-9]+)+$")
_PASCAL_RE = re.compile(r"^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+$")
_IDENT_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


def looks_like_var_or_field_name(text: str) -> bool:
    """True when text looks like a code/variable id, not a business label."""
    t = (text or "").strip()
    if not t or _HANGUL_RE.search(t):
        return False
    if " " in t or "-" in t:
        # Spaced English labels like "12-digit random" are ok as labels.
        return False
    if _CAMEL_RE.match(t) or _PASCAL_RE.match(t):
        return True
    # Bare identifiers (actorId, enName, actor_id) are poor display labels.
    if _IDENT_RE.match(t):
        return True
    return False


def key_looks_like_scenario_var(key: str) -> bool:
    """True when generator key was derived from a Postman/scenario field name."""
    raw = (key or "").strip()
    if not raw:
        return True
    if raw.lower().startswith("pm_"):
        return True
    if _CAMEL_RE.match(raw) or _PASCAL_RE.match(raw):
        return True
    low = raw.lower()
    # Capability-oriented keys keep shape words; bare field ids do not.
    capability_tokens = (
        "random",
        "digit",
        "date",
        "list",
        "pick",
        "name",
        "uuid",
        "today",
        "birth",
        "rrn",
        "offset",
        "english",
        "korean",
        "pakistani",
        "custom",
    )
    if any(tok in low for tok in capability_tokens):
        return False
    return True


def _looks_like_person_name(value: str) -> bool:
    t = (value or "").strip()
    if not t or len(t) > 40:
        return False
    if _HANGUL_RE.search(t):
        return 1 <= len(t) <= 6
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z .'-]{0,38}", t))


def _pick_list_is_person_names(values: list[Any]) -> bool:
    sample = [str(v) for v in values[:8] if str(v).strip()]
    if len(sample) < 2:
        return False
    return all(_looks_like_person_name(v) for v in sample)


def _pick_list_is_hangul_names(values: list[Any]) -> bool:
    sample = [str(v).strip() for v in values[:8] if str(v).strip()]
    if not sample:
        return False
    return all(bool(_HANGUL_RE.search(v)) for v in sample)


def default_business_label(
    impl_kind: str,
    impl: dict[str, Any] | None = None,
    *,
    alias: str = "",
) -> str:
    """Human-facing capability name (Korean) for catalog reuse."""
    kind = (impl_kind or "").strip().lower()
    p = impl or {}
    if kind == "random_digits":
        n = int(p.get("length") or 10)
        return f"난수 {n}자리"
    if kind == "random_birthdate_yyyymmdd":
        lo = int(p.get("min_age") or 18)
        hi = int(p.get("max_age") or 80)
        return f"생년월일({lo}~{hi}세, YYYYMMDD)"
    if kind == "date_offset":
        unit = str(p.get("unit") or "days")
        n = int(p.get("n") or 0)
        unit_ko = {"days": "일", "months": "개월", "years": "년"}.get(unit, unit)
        fmt = str(p.get("format") or "YYYYMMDD")
        if n == 0:
            return f"오늘 날짜({fmt})"
        direction = "전" if n < 0 else "후"
        return f"{abs(n)}{unit_ko}{direction} 날짜({fmt})"
    if kind == "today_yyyymmdd":
        return "오늘 날짜"
    if kind == "uuid":
        return "UUID"
    if kind == "korean_name":
        return "한글 이름"
    if kind == "korean_rrn":
        return "주민번호"
    if kind == "pick_from_list":
        values = p.get("values") if isinstance(p.get("values"), list) else []
        n = len(values)
        if _pick_list_is_person_names(values):
            if _pick_list_is_hangul_names(values):
                return "한글 이름 목록"
            return "영문 이름 목록"
        return f"목록 랜덤 선택({n}개)" if n else "목록 랜덤 선택"
    return "커스텀 생성기"


def default_capability_key(
    impl_kind: str,
    impl: dict[str, Any] | None = None,
    *,
    alias: str = "",
) -> str:
    """Stable snake_case key from capability (not from scenario var names)."""
    kind = (impl_kind or "").strip().lower()
    p = impl or {}
    if kind == "random_digits":
        n = int(p.get("length") or 10)
        key = f"random_digits_{n}" if n != 10 else "random_digits"
        return key if is_valid_generator_key(key) else "random_digits"
    if kind == "random_birthdate_yyyymmdd":
        return "birthdate_yyyymmdd"
    if kind == "date_offset":
        unit = str(p.get("unit") or "days")
        n = int(p.get("n") or 0)
        sign = "minus" if n < 0 else "plus"
        key = f"date_{sign}_{abs(n)}_{unit}"
        return key if is_valid_generator_key(key) else "date_offset"
    if kind in {
        "today_yyyymmdd",
        "uuid",
        "korean_name",
        "korean_rrn",
    }:
        return kind
    if kind == "pick_from_list":
        values = p.get("values") if isinstance(p.get("values"), list) else []
        # Fallback keys only when AI/caller omitted a capability key.
        if _pick_list_is_person_names(values):
            keyed = (
                "korean_name_list"
                if _pick_list_is_hangul_names(values)
                else "english_name"
            )
            return keyed if is_valid_generator_key(keyed) else "english_name"
        return "value_list" if is_valid_generator_key("value_list") else "custom_generator"
    return "custom_generator"


def normalize_generator_naming(
    *,
    key: str,
    label: str,
    impl_kind: str,
    impl: dict[str, Any] | None = None,
    alias: str = "",
) -> tuple[str, str]:
    """
    Prefer capability-based key/label over Postman/scenario variable names.

    Returns (key, label).
    """
    p = impl or {}
    kind = (impl_kind or "").strip().lower()
    cap_key = default_capability_key(kind, p, alias=alias)
    cap_label = default_business_label(kind, p, alias=alias)

    next_label = (label or "").strip()
    if not next_label or looks_like_var_or_field_name(next_label) or next_label == key:
        next_label = cap_label
    # Upgrade generic "이름 목록 랜덤" style when we can be more specific
    if kind == "pick_from_list" and next_label.startswith("이름 목록"):
        next_label = cap_label

    next_key = (key or "").strip().lower()
    if (
        not next_key
        or not is_valid_generator_key(next_key)
        or key_looks_like_scenario_var(next_key)
        or next_key.startswith("list_pick_")
        or re.fullmatch(
            r"(?:english_name|korean_name|value_list)_[a-f0-9]{4,}",
            next_key,
        )
    ):
        next_key = cap_key
    if not is_valid_generator_key(next_key):
        next_key = cap_key
    return next_key, next_label[:128]


def _stable_list_digest(values: list[str]) -> str:
    payload = "\0".join(values[:50]).encode("utf-8", errors="ignore")
    return hashlib.sha1(payload).hexdigest()[:8]


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


@dataclass(frozen=True, slots=True)
class KoreanNameParts:
    """One Korean name draw split into reusable parts (middle empty for ko)."""

    family: str
    given: str
    middle: str
    full: str


def generate_korean_name_parts() -> KoreanNameParts:
    family = random.choice(_KOREAN_SURNAMES)
    given = random.choice(_KOREAN_GIVEN)
    return KoreanNameParts(
        family=family,
        given=given,
        middle="",
        full=family + given,
    )


def korean_name_part(parts: KoreanNameParts, part: str | None) -> str:
    """Map part id (full|family|given|middle) to a string value."""
    key = (part or "full").strip().lower()
    if key in ("", "full", "name"):
        return parts.full
    if key in ("family", "last", "surname"):
        return parts.family
    if key in ("given", "first"):
        return parts.given
    if key == "middle":
        return parts.middle
    return parts.full


def _korean_name() -> str:
    return generate_korean_name_parts().full


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


def resolve_random_birthdate(impl: dict[str, Any]) -> str:
    """Random YYYYMMDD birth date for ages in [min_age, max_age]."""
    try:
        min_age = int(impl.get("min_age") or 18)
    except (TypeError, ValueError):
        min_age = 18
    try:
        max_age = int(impl.get("max_age") or 80)
    except (TypeError, ValueError):
        max_age = 80
    min_age = max(0, min(120, min_age))
    max_age = max(min_age, min(120, max_age))
    today = date.today()
    latest = _add_years(today, -min_age)
    earliest = _add_years(today, -max_age)
    span = max(0, (latest - earliest).days)
    out = earliest + timedelta(days=random.randint(0, span))
    return _format_date(out, "YYYYMMDD")


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
    if kind == "random_birthdate_yyyymmdd":
        return resolve_random_birthdate(impl)
    if kind == "random_digits":
        return _random_digits(int(impl.get("length") or 10))
    if kind == "pick_from_list":
        raw = impl.get("values")
        values = [str(v).strip() for v in raw] if isinstance(raw, list) else []
        values = [v for v in values if v]
        return _pick_from_list(values)
    if kind in ("uuid", "today_yyyymmdd", "korean_name", "korean_rrn"):
        return resolve_generator(kind, params=impl)
    return ""


def split_generator_ref(raw: str | None) -> tuple[str, str | None]:
    """
    Split ``korean_name.family`` → (``korean_name``, ``family``).

    Returns ``(base, part)`` where part is None for full / non-name refs.
    """
    g = (raw or "").strip()
    if not g:
        return "", None
    if "." not in g:
        return g, None
    base, _, part = g.partition(".")
    base = base.strip()
    part = part.strip().lower()
    base_id = normalize_builtin_id(base) or base
    if base_id in ("korean_name", "name") and part in {
        "family",
        "given",
        "middle",
        "full",
    }:
        return "korean_name", None if part == "full" else part
    return g, None


def resolve_start_var_value(
    *,
    value: str,
    generator: str | None,
    catalog: dict[str, CatalogGeneratorSpec] | None = None,
    resolve_cache: dict[str, Any] | None = None,
) -> str:
    """Resolve literal or generator (builtin / DB catalog / name parts)."""
    g_raw = (generator or "").strip()
    if not g_raw:
        return value
    base, part = split_generator_ref(g_raw)
    if base == "korean_name" or normalize_builtin_id(base) == "korean_name":
        if resolve_cache is not None:
            existing = resolve_cache.get("korean_name_parts")
            if isinstance(existing, KoreanNameParts):
                parts = existing
            else:
                parts = generate_korean_name_parts()
                resolve_cache["korean_name_parts"] = parts
        else:
            parts = generate_korean_name_parts()
        return korean_name_part(parts, part)
    builtin = normalize_builtin_id(base)
    if builtin:
        return resolve_generator(builtin)
    if catalog and g_raw in catalog:
        return resolve_catalog_spec(catalog[g_raw])
    if catalog and base in catalog:
        return resolve_catalog_spec(catalog[base])
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
    if kind == "random_birthdate_yyyymmdd":
        try:
            min_age = int(impl.get("min_age") or 18)
        except (TypeError, ValueError) as exc:
            raise ValueError("random_birthdate_yyyymmdd.min_age 가 숫자가 아닙니다.") from exc
        try:
            max_age = int(impl.get("max_age") or 80)
        except (TypeError, ValueError) as exc:
            raise ValueError("random_birthdate_yyyymmdd.max_age 가 숫자가 아닙니다.") from exc
        min_age = max(0, min(120, min_age))
        max_age = max(min_age, min(120, max_age))
        return {"min_age": min_age, "max_age": max_age}
    if kind == "random_digits":
        try:
            length = int(impl.get("length") or 10)
        except (TypeError, ValueError) as exc:
            raise ValueError("random_digits.length 가 숫자가 아닙니다.") from exc
        return {"length": max(1, min(32, length))}
    if kind == "pick_from_list":
        raw = impl.get("values")
        if not isinstance(raw, list):
            raise ValueError("pick_from_list.values 는 문자열 배열이어야 합니다.")
        values: list[str] = []
        seen: set[str] = set()
        for item in raw:
            s = str(item).strip()
            if not s or s in seen:
                continue
            if len(s) > _PICK_LIST_ITEM_MAX:
                s = s[:_PICK_LIST_ITEM_MAX]
            seen.add(s)
            values.append(s)
            if len(values) >= _PICK_LIST_MAX:
                break
        if len(values) < _PICK_LIST_MIN:
            raise ValueError(
                f"pick_from_list.values 는 {_PICK_LIST_MIN}개 이상 필요합니다.",
            )
        return {"values": values}
    return {}


def parse_impl_json(raw: str | None) -> dict[str, Any]:
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def generator_returns_hint(
    impl_kind: str,
    impl: dict[str, Any] | None = None,
) -> str:
    """Short description of the runtime return value shape."""
    kind = (impl_kind or "").strip().lower()
    p = impl or {}
    if kind == "random_digits":
        length = int(p.get("length") or 10)
        return f"{length}-digit numeric string (0-9 only)"
    if kind == "uuid":
        return "UUID string (v4)"
    if kind == "today_yyyymmdd":
        return "date string YYYYMMDD (system today)"
    if kind == "random_birthdate_yyyymmdd":
        lo = int(p.get("min_age") or 18)
        hi = int(p.get("max_age") or 80)
        return f"date string YYYYMMDD (random age {lo}..{hi})"
    if kind == "korean_name":
        return "Korean full name string (family+given)"
    if kind == "korean_rrn":
        return "synthetic Korean RRN string"
    if kind == "date_offset":
        unit = str(p.get("unit") or "days")
        n = p.get("n", 0)
        fmt = str(p.get("format") or "YYYYMMDD")
        return f"date string {fmt} (today {n:+} {unit})"
    if kind == "pick_from_list":
        raw = p.get("values")
        n = len(raw) if isinstance(raw, list) else 0
        return f"one string chosen from a fixed list ({n} values)"
    return "string"


def build_generator_description(
    *,
    impl_kind: str,
    impl: dict[str, Any] | None = None,
    purpose: str = "",
    source: str = "",
    var_name: str = "",
) -> str:
    """
    Persistable metadata for humans and AI matching.

    Stored in ``description`` (max ~512). Keeps returns / purpose / source
    in a stable line-oriented shape.
    """
    p = impl or {}
    returns = generator_returns_hint(impl_kind, p)
    lines = [f"Returns: {returns}."]
    if purpose.strip():
        lines.append(f"Purpose: {purpose.strip()}.")
    kind = (impl_kind or "").strip().lower()
    if kind == "pick_from_list":
        values = p.get("values") if isinstance(p.get("values"), list) else []
        samples = [str(v) for v in values[:5]]
        if samples:
            more = f" (+{len(values) - 5} more)" if len(values) > 5 else ""
            lines.append(f"Samples: {', '.join(samples)}{more}.")
    if kind == "random_digits":
        length = int(p.get("length") or 10)
        lines.append(f"Params: length={length}.")
    if kind == "random_birthdate_yyyymmdd":
        lines.append(
            f"Params: min_age={int(p.get('min_age') or 18)}, "
            f"max_age={int(p.get('max_age') or 80)}."
        )
    if var_name.strip():
        # Field/var aliases help AI match; never use as the generator display name.
        lines.append(f"Aliases: `{var_name.strip()}`.")
    if source.strip():
        lines.append(f"Source: {source.strip()}.")
    text = " ".join(lines)
    return text[:512]


def summarize_generator_for_ai(
    *,
    key: str,
    label: str,
    impl_kind: str | None,
    impl: dict[str, Any] | None = None,
    description: str = "",
    source: str = "shared",
) -> dict[str, Any]:
    """Compact catalog card for LLM reuse/create decisions."""
    kind = (impl_kind or key or "").strip()
    p = impl or {}
    returns = generator_returns_hint(kind, p)
    samples: list[str] = []
    if kind == "pick_from_list" and isinstance(p.get("values"), list):
        samples = [str(v) for v in p["values"][:8]]
    return {
        "key": key,
        "label": label,
        "source": source,
        "impl_kind": kind,
        "returns": returns,
        "description": (description or "").strip()[:400],
        "samples": samples,
        # Keep a trimmed impl for length / date params (not huge lists).
        "impl_summary": (
            {"length": p.get("length")}
            if kind == "random_digits"
            else (
                {"min_age": p.get("min_age"), "max_age": p.get("max_age")}
                if kind == "random_birthdate_yyyymmdd"
                else (
                    {
                        "unit": p.get("unit"),
                        "n": p.get("n"),
                        "format": p.get("format"),
                    }
                    if kind == "date_offset"
                    else (
                        {"value_count": len(p.get("values") or [])}
                        if kind == "pick_from_list"
                        else {}
                    )
                )
            )
        ),
    }

"""Finix dynamic macro grammar (stdlib only — shared by import/export/resolver)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

# Full token match (entire string is a macro).
MACRO_FULL_RE = re.compile(
    r"^\{\{\s*"
    r"(?:"
    r"pool\.(?P<pool_field>[A-Za-z_][\w.]*)"
    r"|\$date\.(?P<date_fn>today|addYears|addDays|addMonths)\((?P<date_arg>-?\d*)\)"
    r"|\$generator\.(?P<gen_fn>[A-Za-z_][\w]*)"
    r"(?:\.(?P<gen_part>family|given|middle|full))?\(\)"
    r"|context\.(?P<ctx_var>[A-Za-z_][\w]*)"
    r")"
    r"\s*\}\}$"
)

# Find macros embedded in longer strings.
MACRO_FIND_RE = re.compile(
    r"\{\{\s*"
    r"(?:"
    r"pool\.[A-Za-z_][\w.]*"
    r"|\$date\.(?:today|addYears|addDays|addMonths)\(-?\d*\)"
    r"|\$generator\.[A-Za-z_][\w]*(?:\.(?:family|given|middle|full))?\(\)"
    r"|context\.[A-Za-z_][\w]*"
    r")"
    r"\s*\}\}"
)

# Only Finix dynamic macros (not Postman {{custId}} placeholders).
OUR_MACRO_PREFIX_RE = re.compile(
    r"^\{\{\s*(?:pool\.|\$date\.|\$generator\.|context\.)"
)

_NAME_PARTS = frozenset({"family", "given", "middle", "full"})
_NAME_GENERATOR_FNS = frozenset({"name", "korean_name"})

# YAML $generator.fn() → collection-var builtin id
GENERATOR_FN_TO_BUILTIN: dict[str, str] = {
    "ssn": "korean_rrn",
    "name": "korean_name",
    "uuid": "uuid",
    "random_digits": "random_digits",
    "korean_rrn": "korean_rrn",
    "korean_name": "korean_name",
}

# Builtin / date ids → Finix YAML token (import script mapping + export).
BUILTIN_TO_FINIX_TOKEN: dict[str, str] = {
    "uuid": "{{$generator.uuid()}}",
    "random_digits": "{{$generator.random_digits()}}",
    "korean_name": "{{$generator.name()}}",
    "korean_rrn": "{{$generator.ssn()}}",
    "today_yyyymmdd": "{{$date.today()}}",
}


@dataclass(frozen=True, slots=True)
class ParsedMacro:
    kind: str  # pool | date | generator | context
    raw: str
    field: str | None = None
    fn: str | None = None
    arg: int | None = None
    part: str | None = None  # name.family / name.given / …


def is_macro_string(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return bool(MACRO_FULL_RE.match(value.strip()))


def looks_like_finix_macro(value: Any) -> bool:
    """True when a string is/contains a Finix dynamic macro (not bare {{var}})."""
    if not isinstance(value, str):
        return False
    text = value.strip()
    if OUR_MACRO_PREFIX_RE.match(text):
        return True
    # Mixed strings like "{{$generator.a()}}@test.com"
    return bool(MACRO_FIND_RE.search(value))


def parse_macro(value: str) -> ParsedMacro | None:
    """Parse a whole-string macro; None if not a recognized macro."""
    raw = (value or "").strip()
    m = MACRO_FULL_RE.match(raw)
    if not m:
        return None
    if m.group("pool_field"):
        return ParsedMacro(kind="pool", raw=raw, field=m.group("pool_field"))
    if m.group("date_fn"):
        fn = m.group("date_fn")
        arg_raw = m.group("date_arg") or ""
        if fn == "today":
            arg = None
        else:
            arg = int(arg_raw) if arg_raw not in ("",) else 0
        return ParsedMacro(kind="date", raw=raw, fn=fn, arg=arg)
    if m.group("gen_fn"):
        fn = m.group("gen_fn")
        part = m.group("gen_part")
        if part and fn not in _NAME_GENERATOR_FNS:
            return None
        if part and part not in _NAME_PARTS:
            return None
        return ParsedMacro(kind="generator", raw=raw, fn=fn, part=part)
    if m.group("ctx_var"):
        return ParsedMacro(kind="context", raw=raw, field=m.group("ctx_var"))
    return None


def find_macros(text: str) -> list[str]:
    return MACRO_FIND_RE.findall(text or "")


def finix_token_for_builtin_id(builtin_id: str | None) -> str | None:
    """Return the canonical Finix macro for a collection-var builtin id."""
    key = (builtin_id or "").strip().lower()
    if not key:
        return None
    token = BUILTIN_TO_FINIX_TOKEN.get(key)
    if token is None:
        return None
    return token if parse_macro(token) is not None else None


def finix_context_token(var_name: str) -> str | None:
    """Build ``{{context.NAME}}`` when *var_name* is a valid context key."""
    name = (var_name or "").strip()
    if not name or not re.match(r"^[A-Za-z_][\w]*$", name):
        return None
    token = f"{{{{context.{name}}}}}"
    return token if parse_macro(token) is not None else None

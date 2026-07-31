"""
Dynamic macro grammar and evaluation contract for YAML rule inputs.

P0: grammar + validation + safe no-op evaluate skeleton.
P2: full resolve against pool / clock / generator / context at run time.

Supported forms (stored as string values in rules[].input):
  {{pool.fieldPath}}
  {{$date.today()}}
  {{$date.addYears(n)}} / {{$date.addDays(n)}} / {{$date.addMonths(n)}}
  {{$generator.ssn()}} / {{$generator.name()}}
  {{context.VAR_NAME}}
"""

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
    r"|\$generator\.(?P<gen_fn>ssn|name)\(\)"
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
    r"|\$generator\.(?:ssn|name)\(\)"
    r"|context\.[A-Za-z_][\w]*"
    r")"
    r"\s*\}\}"
)


@dataclass(frozen=True, slots=True)
class ParsedMacro:
    kind: str  # pool | date | generator | context
    raw: str
    field: str | None = None
    fn: str | None = None
    arg: int | None = None


def is_macro_string(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return bool(MACRO_FULL_RE.match(value.strip()))


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
        arg = int(arg_raw) if arg_raw not in ("",) and fn != "today" else (
            0 if fn == "today" else int(arg_raw or "0")
        )
        if fn == "today":
            arg = None
        return ParsedMacro(kind="date", raw=raw, fn=fn, arg=arg)
    if m.group("gen_fn"):
        return ParsedMacro(kind="generator", raw=raw, fn=m.group("gen_fn"))
    if m.group("ctx_var"):
        return ParsedMacro(kind="context", raw=raw, field=m.group("ctx_var"))
    return None


def find_macros(text: str) -> list[str]:
    return MACRO_FIND_RE.findall(text or "")


def validate_macro_or_raise(value: str) -> ParsedMacro:
    parsed = parse_macro(value)
    if parsed is None:
        raise ValueError(
            f"알 수 없는 매크로입니다: {value!r}. "
            "허용: {{pool.x}}, {{$date.today()}}, {{$date.addYears(n)}}, "
            "{{$generator.ssn()}}, {{$generator.name()}}, {{context.VAR}}"
        )
    return parsed


def evaluate_macro(
    value: str,
    *,
    context: dict[str, Any] | None = None,
    pool_fields: dict[str, Any] | None = None,
) -> Any:
    """
    Evaluate a full-string macro.

    P0: context and pool lookups only; date/generator return placeholder strings
    that keep shape stable until P2 clocks/generators land.
    """
    parsed = parse_macro(value)
    if parsed is None:
        return value

    if parsed.kind == "context":
        ctx = context or {}
        key = parsed.field or ""
        if key not in ctx:
            raise KeyError(f"context.{key} 가 실행 컨텍스트에 없습니다.")
        return ctx[key]

    if parsed.kind == "pool":
        fields = pool_fields or {}
        key = parsed.field or ""
        if key not in fields:
            raise KeyError(f"pool.{key} 를 Data Pool 샘플에서 찾지 못했습니다.")
        return fields[key]

    if parsed.kind == "date":
        # P0 stub — P2 replaces with real clock.
        fn = parsed.fn or "today"
        if fn == "today":
            return "{{$date.today()}}"
        return f"{{{{$date.{fn}({parsed.arg or 0})}}}}"

    if parsed.kind == "generator":
        fn = parsed.fn or "name"
        return f"{{{{$generator.{fn}()}}}}"

    return value


def resolve_value(
    value: Any,
    *,
    context: dict[str, Any] | None = None,
    pool_fields: dict[str, Any] | None = None,
) -> Any:
    """Resolve a single input value when it is a full-string macro."""
    if isinstance(value, str) and is_macro_string(value):
        return evaluate_macro(value, context=context, pool_fields=pool_fields)
    return value


def resolve_mapping(
    data: dict[str, Any],
    *,
    context: dict[str, Any] | None = None,
    pool_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Shallow-resolve macros in a flat/nested dict (recursive)."""
    out: dict[str, Any] = {}
    for key, val in data.items():
        if isinstance(val, dict):
            out[key] = resolve_mapping(val, context=context, pool_fields=pool_fields)
        elif isinstance(val, list):
            out[key] = [
                resolve_mapping(item, context=context, pool_fields=pool_fields)
                if isinstance(item, dict)
                else resolve_value(item, context=context, pool_fields=pool_fields)
                for item in val
            ]
        else:
            out[key] = resolve_value(val, context=context, pool_fields=pool_fields)
    return out

"""
Dynamic macro grammar and evaluation for YAML rule inputs.

Supported forms (stored as string values in rules[].input):
  {{pool.fieldPath}}
  {{$date.today()}}
  {{$date.addYears(n)}} / {{$date.addDays(n)}} / {{$date.addMonths(n)}}
  {{$generator.ssn()}} / {{$generator.name()}} / {{$generator.uuid()}}
  {{$generator.name.family()}} / {{$generator.name.given()}} /
  {{$generator.name.middle()}} / {{$generator.name.full()}}
  {{$generator.random_digits()}} / {{$generator.<catalog_key>()}}
  {{context.VAR_NAME}}

Scenario builtin ids map to YAML tokens:
  today_yyyymmdd → {{$date.today()}}
  korean_name → {{$generator.name()}}
  korean_rrn → {{$generator.ssn()}}
  uuid → {{$generator.uuid()}}
  random_digits → {{$generator.random_digits()}}
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

from app.domain.collection_var_generators import (
    CatalogGeneratorSpec,
    KoreanNameParts,
    generate_korean_name_parts,
    korean_name_part,
    resolve_catalog_spec,
    resolve_date_offset,
    resolve_generator,
)
from app.domain.postman_default_headers import fcc_tx_date_today

_NAME_PARTS = frozenset({"family", "given", "middle", "full"})
_NAME_GENERATOR_FNS = frozenset({"name", "korean_name"})

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
_OUR_MACRO_PREFIX_RE = re.compile(
    r"^\{\{\s*(?:pool\.|\$date\.|\$generator\.|context\.)"
)

# YAML $generator.fn() → collection-var builtin id
_GENERATOR_FN_TO_BUILTIN: dict[str, str] = {
    "ssn": "korean_rrn",
    "name": "korean_name",
    "uuid": "uuid",
    "random_digits": "random_digits",
    "korean_rrn": "korean_rrn",
    "korean_name": "korean_name",
}

_NAME_PARTS_CACHE_KEY = "korean_name_parts"


@dataclass(frozen=True, slots=True)
class ParsedMacro:
    kind: str  # pool | date | generator | context
    raw: str
    field: str | None = None
    fn: str | None = None
    arg: int | None = None
    part: str | None = None  # name.family / name.given / …


MissingPolicy = Literal["raise", "keep"]


def is_macro_string(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return bool(MACRO_FULL_RE.match(value.strip()))


def looks_like_finix_macro(value: Any) -> bool:
    """True when a string claims to be a Finix dynamic macro (not bare {{var}})."""
    if not isinstance(value, str):
        return False
    return bool(_OUR_MACRO_PREFIX_RE.match(value.strip()))


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


def validate_macro_or_raise(value: str) -> ParsedMacro:
    parsed = parse_macro(value)
    if parsed is None:
        raise ValueError(
            f"알 수 없는 매크로입니다: {value!r}. "
            "허용: {{pool.x}}, {{$date.today()}}, {{$date.addYears(n)}}, "
            "{{$generator.ssn()|name()|name.family()|name.given()|"
            "name.middle()|uuid()|random_digits()|<catalog_key>()}}, "
            "{{context.VAR}}"
        )
    return parsed


def validate_input_macros(
    data: Any,
    *,
    path: str = "input",
) -> list[str]:
    """
    Walk rule input and validate Finix dynamic macros only.

    Returns a list of error messages (empty when valid).
    Postman-style ``{{custId}}`` placeholders are ignored.
    """
    errors: list[str] = []

    def walk(node: Any, node_path: str) -> None:
        if isinstance(node, dict):
            for key, val in node.items():
                walk(val, f"{node_path}.{key}")
            return
        if isinstance(node, list):
            for i, item in enumerate(node):
                walk(item, f"{node_path}[{i}]")
            return
        if not looks_like_finix_macro(node):
            return
        try:
            validate_macro_or_raise(str(node).strip())
        except ValueError as exc:
            errors.append(f"{node_path}: {exc}")

    walk(data, path)
    return errors


def _resolve_date(parsed: ParsedMacro) -> str:
    fn = parsed.fn or "today"
    if fn == "today":
        return fcc_tx_date_today()
    n = parsed.arg if parsed.arg is not None else 0
    unit = {
        "addDays": "days",
        "addMonths": "months",
        "addYears": "years",
    }.get(fn, "days")
    return resolve_date_offset({"unit": unit, "n": n, "format": "YYYYMMDD"})


def _korean_name_parts_from_cache(
    cache: dict[str, Any] | None,
) -> KoreanNameParts:
    if cache is not None:
        existing = cache.get(_NAME_PARTS_CACHE_KEY)
        if isinstance(existing, KoreanNameParts):
            return existing
    parts = generate_korean_name_parts()
    if cache is not None:
        cache[_NAME_PARTS_CACHE_KEY] = parts
    return parts


def _resolve_generator(
    parsed: ParsedMacro,
    *,
    catalog: dict[str, CatalogGeneratorSpec] | None,
    resolve_cache: dict[str, Any] | None,
) -> str:
    fn = (parsed.fn or "").strip()
    if fn in _NAME_GENERATOR_FNS:
        parts = _korean_name_parts_from_cache(resolve_cache)
        return korean_name_part(parts, parsed.part)
    builtin = _GENERATOR_FN_TO_BUILTIN.get(fn)
    if builtin:
        return resolve_generator(builtin)
    if catalog and fn in catalog:
        return resolve_catalog_spec(catalog[fn])
    # Unknown catalog key — still try as builtin id spelling
    from_builtin = resolve_generator(fn)
    if from_builtin:
        return from_builtin
    raise KeyError(f"generator.{fn} 를 찾을 수 없습니다.")


def evaluate_macro(
    value: str,
    *,
    context: dict[str, Any] | None = None,
    pool_fields: dict[str, Any] | None = None,
    catalog: dict[str, CatalogGeneratorSpec] | None = None,
    on_missing: MissingPolicy = "raise",
    resolve_cache: dict[str, Any] | None = None,
) -> Any:
    """
    Evaluate a full-string macro to a concrete runtime value.

    ``on_missing``:
    - ``raise`` — KeyError when pool/context/generator is missing
    - ``keep`` — return the original macro string when lookup fails

    ``resolve_cache`` shares one Korean-name draw across name / name.family /
    name.given / name.middle within the same resolve pass.
    """
    parsed = parse_macro(value)
    if parsed is None:
        return value

    try:
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
            return _resolve_date(parsed)

        if parsed.kind == "generator":
            return _resolve_generator(
                parsed,
                catalog=catalog,
                resolve_cache=resolve_cache,
            )
    except KeyError:
        if on_missing == "keep":
            return value
        raise

    return value


def resolve_value(
    value: Any,
    *,
    context: dict[str, Any] | None = None,
    pool_fields: dict[str, Any] | None = None,
    catalog: dict[str, CatalogGeneratorSpec] | None = None,
    on_missing: MissingPolicy = "raise",
    warnings: list[str] | None = None,
    path: str = "",
    resolve_cache: dict[str, Any] | None = None,
) -> Any:
    """Resolve a single input value when it is a full-string macro."""
    if not (isinstance(value, str) and is_macro_string(value)):
        return value
    try:
        return evaluate_macro(
            value,
            context=context,
            pool_fields=pool_fields,
            catalog=catalog,
            on_missing="raise",
            resolve_cache=resolve_cache,
        )
    except KeyError as exc:
        if on_missing == "keep":
            if warnings is not None:
                label = path or "input"
                warnings.append(f"{label}: {exc.args[0] if exc.args else exc}")
            return value
        raise


def resolve_mapping(
    data: dict[str, Any],
    *,
    context: dict[str, Any] | None = None,
    pool_fields: dict[str, Any] | None = None,
    catalog: dict[str, CatalogGeneratorSpec] | None = None,
    on_missing: MissingPolicy = "raise",
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    """Resolve Finix macros in a nested dict (recursive)."""
    resolve_cache: dict[str, Any] = {}

    def walk(node: Any, node_path: str) -> Any:
        if isinstance(node, dict):
            return {
                key: walk(val, f"{node_path}.{key}" if node_path else str(key))
                for key, val in node.items()
            }
        if isinstance(node, list):
            return [
                walk(item, f"{node_path}[{i}]") for i, item in enumerate(node)
            ]
        return resolve_value(
            node,
            context=context,
            pool_fields=pool_fields,
            catalog=catalog,
            on_missing=on_missing,
            warnings=warnings,
            path=node_path or "input",
            resolve_cache=resolve_cache,
        )

    resolved = walk(data, "")
    assert isinstance(resolved, dict)
    return resolved

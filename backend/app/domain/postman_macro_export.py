"""
Convert Finix YAML input macros into Postman ``{{var}}`` + collection pre-request scripts.

Export must NOT bake resolved random/date values into request bodies.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from app.domain.dynamic_macro_resolver import (
    MACRO_FIND_RE,
    _GENERATOR_FN_TO_BUILTIN,
    parse_macro,
)
from app.domain.postman_generator_scripts import _script_for_generator


@dataclass(frozen=True, slots=True)
class FinixMacroExportSpec:
    """One Finix macro mapped to a Postman collection variable."""

    var_key: str
    raw_macro: str
    kind: str  # generator | date | pool | context
    generator_id: str | None = None  # builtin / date_offset id for scripts
    date_fn: str | None = None
    date_arg: int | None = None
    name_part: str | None = None  # full|family|given|middle for korean_name


def postman_var_key_for_macro(raw: str) -> str | None:
    """Stable Postman-safe variable name for a Finix macro token."""
    parsed = parse_macro(raw.strip())
    if parsed is None:
        return None
    if parsed.kind == "generator":
        fn = (parsed.fn or "x").strip()
        part = (parsed.part or "").strip()
        if part:
            return f"gen_{fn}_{part}"
        return f"gen_{fn}"
    if parsed.kind == "date":
        fn = (parsed.fn or "today").strip()
        if fn == "today":
            return "date_today"
        return f"date_{fn}_{parsed.arg if parsed.arg is not None else 0}"
    if parsed.kind == "pool":
        field = (parsed.field or "x").replace(".", "_")
        return f"pool_{field}"
    if parsed.kind == "context":
        field = (parsed.field or "x").replace(".", "_")
        return f"ctx_{field}"
    return None


def _spec_for_raw_macro(raw: str) -> FinixMacroExportSpec | None:
    token = raw.strip()
    parsed = parse_macro(token)
    if parsed is None:
        return None
    key = postman_var_key_for_macro(token)
    if not key:
        return None
    if parsed.kind == "generator":
        fn = (parsed.fn or "").strip()
        part = (parsed.part or "").strip() or None
        if fn in ("name", "korean_name"):
            # Shared Korean-name bundle; part selects which export var to fill.
            builtin = "korean_name"
            return FinixMacroExportSpec(
                var_key=key,
                raw_macro=token,
                kind="generator",
                generator_id=builtin,
                name_part=part or "full",
            )
        builtin = _GENERATOR_FN_TO_BUILTIN.get(fn, fn)
        return FinixMacroExportSpec(
            var_key=key,
            raw_macro=token,
            kind="generator",
            generator_id=builtin or fn,
        )
    if parsed.kind == "date":
        return FinixMacroExportSpec(
            var_key=key,
            raw_macro=token,
            kind="date",
            date_fn=parsed.fn,
            date_arg=parsed.arg,
            generator_id=(
                "today_yyyymmdd" if parsed.fn == "today" else None
            ),
        )
    return FinixMacroExportSpec(
        var_key=key,
        raw_macro=token,
        kind=parsed.kind,
    )


def _rewrite_string(value: str, specs: dict[str, FinixMacroExportSpec]) -> str:
    stripped = value.strip()
    if parse_macro(stripped) is not None:
        spec = _spec_for_raw_macro(stripped)
        if spec is None:
            return value
        specs[spec.var_key] = spec
        return f"{{{{{spec.var_key}}}}}"

    def repl(match: re.Match[str]) -> str:
        token = match.group(0)
        spec = _spec_for_raw_macro(token)
        if spec is None:
            return token
        specs[spec.var_key] = spec
        return f"{{{{{spec.var_key}}}}}"

    return MACRO_FIND_RE.sub(repl, value)


def rewrite_mapping_macros_for_postman(
    data: Any,
) -> tuple[Any, list[FinixMacroExportSpec]]:
    """
    Replace Finix macros in a JSON-like mapping with Postman ``{{var}}`` placeholders.

    Returns ``(rewritten, unique specs)``.
    """
    specs: dict[str, FinixMacroExportSpec] = {}

    def walk(node: Any) -> Any:
        if isinstance(node, dict):
            return {k: walk(v) for k, v in node.items()}
        if isinstance(node, list):
            return [walk(v) for v in node]
        if isinstance(node, str):
            return _rewrite_string(node, specs)
        return node

    return walk(data), list(specs.values())


def _date_offset_script(var_key: str, *, unit: str, n: int) -> list[str]:
    safe_key = json.dumps(var_key, ensure_ascii=False)
    safe_unit = json.dumps(unit, ensure_ascii=False)
    return [
        f"pm.collectionVariables.set({safe_key}, (function(){{",
        "  const d = new Date();",
        f"  const unit = {safe_unit};",
        f"  const n = {int(n)};",
        "  if (unit === 'months' || unit === 'month') d.setMonth(d.getMonth() + n);",
        "  else if (unit === 'years' || unit === 'year') d.setFullYear(d.getFullYear() + n);",
        "  else d.setDate(d.getDate() + n);",
        "  const y = d.getFullYear();",
        "  const m = String(d.getMonth() + 1).padStart(2, '0');",
        "  const day = String(d.getDate()).padStart(2, '0');",
        "  return y + m + day;",
        "})());",
    ]


def script_lines_for_macro_spec(spec: FinixMacroExportSpec) -> list[str] | None:
    """JS lines that set ``spec.var_key`` (no first-request wrapper)."""
    # Korean name parts are seeded as a shared bundle in build_*.
    if spec.generator_id == "korean_name" and spec.name_part is not None:
        return None
    if spec.kind == "generator" and spec.generator_id:
        return _script_for_generator(spec.var_key, spec.generator_id, catalog=None)
    if spec.kind == "date":
        fn = (spec.date_fn or "today").strip()
        if fn == "today":
            return _script_for_generator(
                spec.var_key, "today_yyyymmdd", catalog=None
            )
        unit = {
            "addDays": "days",
            "addMonths": "months",
            "addYears": "years",
        }.get(fn, "days")
        return _date_offset_script(
            spec.var_key, unit=unit, n=spec.date_arg if spec.date_arg is not None else 0
        )
    return None


def _korean_name_bundle_script_lines(
    specs: list[FinixMacroExportSpec],
) -> list[str]:
    """One draw → family/given/middle/full, then copy into requested vars."""
    name_specs = [
        s
        for s in specs
        if s.generator_id == "korean_name" and s.name_part is not None
    ]
    if not name_specs:
        return []

    part_to_tmp = {
        "family": "__finix_kn_family",
        "given": "__finix_kn_given",
        "middle": "__finix_kn_middle",
        "full": "__finix_kn_full",
    }
    lines: list[str] = [
        "(function(){",
        '  const S=["김","이","박","최","정","강","조","윤","장","임","한","오","서","신","권"];',
        '  const G=["민준","서연","예준","서윤","도윤","지우","하준","서준","주원","지민"];',
        "  const family = S[Math.floor(Math.random()*S.length)];",
        "  const given = G[Math.floor(Math.random()*G.length)];",
        '  pm.collectionVariables.set("__finix_kn_family", family);',
        '  pm.collectionVariables.set("__finix_kn_given", given);',
        '  pm.collectionVariables.set("__finix_kn_middle", "");',
        '  pm.collectionVariables.set("__finix_kn_full", family + given);',
        "})();",
    ]
    seen_keys: set[str] = set()
    for spec in name_specs:
        if spec.var_key in seen_keys:
            continue
        seen_keys.add(spec.var_key)
        part = (spec.name_part or "full").strip().lower()
        tmp = part_to_tmp.get(part, "__finix_kn_full")
        safe_key = json.dumps(spec.var_key, ensure_ascii=False)
        safe_tmp = json.dumps(tmp, ensure_ascii=False)
        lines.append(
            f"pm.collectionVariables.set({safe_key}, "
            f"pm.collectionVariables.get({safe_tmp}) || '');"
        )
    return lines


def build_finix_macro_prerequest_exec_lines(
    specs: list[FinixMacroExportSpec],
) -> list[str]:
    """
    Collection pre-request: re-seed Finix macro vars on first request of each run.

    Same ``pm.execution.location`` guard as start-var generators.
    """
    blocks: list[list[str]] = []
    seen: set[str] = set()

    name_bundle = _korean_name_bundle_script_lines(specs)
    if name_bundle:
        blocks.append(name_bundle)
        for spec in specs:
            if spec.generator_id == "korean_name" and spec.name_part is not None:
                seen.add(spec.var_key)

    for spec in specs:
        if spec.var_key in seen:
            continue
        seen.add(spec.var_key)
        lines = script_lines_for_macro_spec(spec)
        if lines:
            blocks.append(lines)
    if not blocks:
        return []

    out: list[str] = [
        "// FINIX: re-seed YAML dynamic macros on first request of each run",
        "const __finixMacroLoc = (pm.execution && pm.execution.location) || [];",
        "const __finixMacroFirst = __finixMacroLoc.length === 1 && __finixMacroLoc[0] === 0;",
        "if (__finixMacroFirst) {",
    ]
    for block in blocks:
        out.extend(f"  {line}" for line in block)
    out.append("}")
    return out


def collection_variables_for_macro_specs(
    specs: list[FinixMacroExportSpec],
) -> list[dict[str, str]]:
    """Empty initial values; pre-request scripts populate them."""
    seen: set[str] = set()
    rows: list[dict[str, str]] = []
    for spec in specs:
        if spec.var_key in seen:
            continue
        seen.add(spec.var_key)
        rows.append(
            {
                "key": spec.var_key,
                "value": "",
                "type": "string",
            }
        )
    return rows

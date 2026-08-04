"""Emit Postman pre-request scripts that re-seed collection start-var generators."""

from __future__ import annotations

import json
from typing import Any

from app.domain.collection_var_generators import CatalogGeneratorSpec
from app.domain.postman_bxm_system_header import collection_start_vars
from app.domain.postman_collection_config import PostmanCollectionConfig


def _js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _script_for_generator(
    key: str,
    generator: str,
    *,
    catalog: dict[str, CatalogGeneratorSpec] | None,
) -> list[str] | None:
    """Return JS lines that set ``key`` from a FINIX generator, or None if literal."""
    g = (generator or "").strip()
    if not g:
        return None
    safe_key = _js_string(key)

    if g == "today_yyyymmdd":
        return [
            f"pm.collectionVariables.set({safe_key}, (function(){{",
            "  const d = new Date();",
            "  return d.getFullYear()",
            "    + String(d.getMonth() + 1).padStart(2, '0')",
            "    + String(d.getDate()).padStart(2, '0');",
            "})());",
        ]
    if g == "uuid":
        return [
            f"pm.collectionVariables.set({safe_key}, (function(){{",
            "  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {",
            "    const r = Math.random() * 16 | 0;",
            "    const v = c === 'x' ? r : (r & 0x3 | 0x8);",
            "    return v.toString(16);",
            "  });",
            "})());",
        ]
    if g == "random_digits":
        length = 10
        if catalog and g in catalog:
            try:
                length = int((catalog[g].impl or {}).get("length") or 10)
            except (TypeError, ValueError):
                length = 10
        length = max(1, min(32, length))
        return [
            f"pm.collectionVariables.set({safe_key}, (function(){{",
            f"  let s = ''; for (let i = 0; i < {length}; i++) s += String(Math.floor(Math.random()*10));",
            "  return s;",
            "})());",
        ]
    if g == "korean_name":
        return [
            f"pm.collectionVariables.set({safe_key}, (function(){{",
            '  const S=["김","이","박","최","정","강","조","윤","장","임"];',
            '  const G=["민준","서연","예준","서윤","도윤","지우","하준","서준"];',
            "  return S[Math.floor(Math.random()*S.length)] + G[Math.floor(Math.random()*G.length)];",
            "})());",
        ]
    if g == "korean_rrn":
        return [
            f"pm.collectionVariables.set({safe_key}, (function(){{",
            "  const yy = String(70 + Math.floor(Math.random()*30)).padStart(2,'0');",
            "  const mm = String(1 + Math.floor(Math.random()*12)).padStart(2,'0');",
            "  const dd = String(1 + Math.floor(Math.random()*28)).padStart(2,'0');",
            "  const sex = Math.random() < 0.5 ? '1' : '2';",
            "  const region = String(Math.floor(Math.random()*100000)).padStart(5,'0');",
            "  const body12 = yy + mm + dd + sex + region;",
            "  const w = [2,3,4,5,6,7,8,9,2,3,4,5];",
            "  let t = 0; for (let i=0;i<12;i++) t += Number(body12[i]) * w[i];",
            "  return body12 + String((11 - (t % 11)) % 10);",
            "})());",
        ]

    # Shared catalog / date_offset / pick_from_list keyed by generator id
    if catalog and g in catalog:
        spec = catalog[g]
        kind = (spec.impl_kind or "").strip().lower()
        impl = spec.impl or {}
        if kind == "pick_from_list":
            values = impl.get("values") if isinstance(impl.get("values"), list) else []
            cleaned = [str(v).strip() for v in values if str(v).strip()]
            if len(cleaned) < 2:
                return None
            arr = json.dumps(cleaned, ensure_ascii=False)
            return [
                f"pm.collectionVariables.set({safe_key}, (function(){{",
                f"  const VALUES = {arr};",
                "  return VALUES[Math.floor(Math.random() * VALUES.length)];",
                "})());",
            ]
        if kind == "date_offset":
            unit = str(impl.get("unit") or "days")
            try:
                n = int(impl.get("n", 0))
            except (TypeError, ValueError):
                n = 0
            fmt = str(impl.get("format") or "YYYYMMDD").upper()
            return [
                f"pm.collectionVariables.set({safe_key}, (function(){{",
                "  const d = new Date();",
                f"  const unit = {_js_string(unit)};",
                f"  const n = {n};",
                "  if (unit === 'months' || unit === 'month') d.setMonth(d.getMonth() + n);",
                "  else if (unit === 'years' || unit === 'year') d.setFullYear(d.getFullYear() + n);",
                "  else d.setDate(d.getDate() + n);",
                f"  const fmt = {_js_string(fmt)};",
                "  const y = d.getFullYear();",
                "  const m = String(d.getMonth() + 1).padStart(2, '0');",
                "  const day = String(d.getDate()).padStart(2, '0');",
                "  return fmt === 'YYYY-MM-DD' ? (y + '-' + m + '-' + day) : (y + m + day);",
                "})());",
            ]
        if kind == "random_digits":
            try:
                length = int(impl.get("length") or 10)
            except (TypeError, ValueError):
                length = 10
            length = max(1, min(32, length))
            return [
                f"pm.collectionVariables.set({safe_key}, (function(){{",
                f"  let s = ''; for (let i = 0; i < {length}; i++) s += String(Math.floor(Math.random()*10));",
                "  return s;",
                "})());",
            ]
        if kind in ("uuid", "today_yyyymmdd", "korean_name", "korean_rrn"):
            return _script_for_generator(key, kind, catalog=None)

    # Builtin id used as catalog key alias
    if g in (
        "today_yyyymmdd",
        "uuid",
        "random_digits",
        "korean_name",
        "korean_rrn",
    ):
        return _script_for_generator(key, g, catalog=None)
    return None


def build_start_var_generator_exec_lines(
    config: PostmanCollectionConfig | None,
    *,
    catalog: dict[str, CatalogGeneratorSpec] | None = None,
) -> list[str]:
    """
    JS exec lines: on the first request of a run, re-seed generator-backed start vars.

    Uses ``pm.execution.location`` so values stay stable for the rest of the run,
    then refresh on the next Collection Runner iteration.
    """
    rows = collection_start_vars(config)
    blocks: list[list[str]] = []
    for row in rows:
        key = row.key.strip()
        gen = (row.generator or "").strip()
        if not key or not gen:
            continue
        lines = _script_for_generator(key, gen, catalog=catalog)
        if lines:
            blocks.append(lines)
    if not blocks:
        return []

    out: list[str] = [
        "// FINIX: re-seed dynamic collection variables on first request of each run",
        "const __finixLoc = (pm.execution && pm.execution.location) || [];",
        "const __finixFirst = __finixLoc.length === 1 && __finixLoc[0] === 0;",
        "if (__finixFirst) {",
    ]
    for block in blocks:
        out.extend(f"  {line}" for line in block)
    out.append("}")
    return out


def merge_collection_prerequest_events(
    *events: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """Concatenate prerequest script exec lines into one collection event."""
    exec_lines: list[str] = []
    for ev in events:
        if not ev or ev.get("listen") != "prerequest":
            continue
        script = ev.get("script") if isinstance(ev.get("script"), dict) else {}
        lines = script.get("exec") if isinstance(script, dict) else None
        if isinstance(lines, list):
            if exec_lines:
                exec_lines.append("")
            exec_lines.extend(str(x) for x in lines)
        elif isinstance(script.get("exec"), str):
            if exec_lines:
                exec_lines.append("")
            exec_lines.extend(str(script["exec"]).split("\n"))
    if not exec_lines:
        return []
    return [
        {
            "listen": "prerequest",
            "script": {"type": "text/javascript", "exec": exec_lines},
        },
    ]

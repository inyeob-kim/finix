"""Postman Collection v2.1 scripts and placeholder bodies for scenario chaining."""

from __future__ import annotations

import json
import re
from typing import Any

from app.domain.scenario_bindings import ExtractSpec, InjectSpec, json_path_set, normalize_json_path_prefix

_PATH_SEGMENT = re.compile(r"[^.\[\]]+")


def _path_to_js_accessor(json_path: str) -> str:
    """Build ``data?.a?.b`` from ``$.a.b`` (safe identifier segments only)."""
    raw = normalize_json_path_prefix(json_path)
    if raw.startswith("$."):
        raw = raw[2:]
    elif raw.startswith("$"):
        raw = raw[1:].lstrip(".")
    parts = [p for p in _PATH_SEGMENT.findall(raw) if p]
    if not parts:
        return "data"
    expr = "data"
    for part in parts:
        if part.isdigit():
            expr += f"[{part}]"
        elif re.match(r"^[A-Za-z_$][\w$]*$", part):
            expr += f".{part}"
        else:
            expr += f"[{json.dumps(part)}]"
    return expr


def apply_postman_inject_placeholders(
    request_body: dict[str, Any],
    injects: list[InjectSpec],
) -> dict[str, Any]:
    """Replace inject targets with Postman ``{{var}}`` placeholders (not resolved literals)."""
    body = dict(request_body)
    for spec in injects:
        placeholder = f"{{{{{spec.var}}}}}"
        body = json_path_set(body, spec.json_path, placeholder)
    return body


def build_postman_request_body(
    template: dict[str, Any],
    *,
    injects: list[InjectSpec],
    overrides: list[Any] | None = None,
) -> dict[str, Any]:
    """Literal scenario overrides first, then ``{{var}}`` inject placeholders."""
    from app.domain.scenario_bindings import OverrideSpec, apply_overrides

    ov = [o if isinstance(o, OverrideSpec) else OverrideSpec.model_validate(o) for o in (overrides or [])]
    body = apply_overrides(template, ov)
    return apply_postman_inject_placeholders(body, injects)


def build_extract_test_script(
    extracts: list[ExtractSpec],
    *,
    expected_status: int | None = None,
) -> list[dict[str, Any]]:
    """Postman ``test`` event: status check + ``pm.collectionVariables.set`` for each extract."""
    lines = [
        "// Auto-generated: propagate response identifiers to collection variables",
        "const data = pm.response.json();",
    ]
    if expected_status is not None:
        lines.append(
            f'pm.test("Status code is {expected_status}", function () {{'
            f" pm.response.to.have.status({expected_status}); }});",
        )
    else:
        lines.append(
            'pm.test("Response is JSON", function () {'
            " pm.expect(data).to.be.an('object'); });",
        )
    lines.append("if (data && typeof data === 'object') {")
    for spec in extracts:
        accessor = _path_to_js_accessor(spec.json_path)
        var = spec.var.replace("\\", "\\\\").replace('"', '\\"')
        lines.append(f"  try {{")
        lines.append(f"    const v = {accessor};")
        lines.append(f'    if (v !== undefined && v !== null) {{')
        lines.append(f'      pm.collectionVariables.set("{var}", String(v));')
        lines.append(f"    }}")
        lines.append(f"  }} catch (e) {{ /* skip {var} */ }}")
    lines.append("}")
    script = "\n".join(lines)
    return [{"listen": "test", "script": {"type": "text/javascript", "exec": script.split("\n")}}]


def build_prerequest_script(injects: list[InjectSpec]) -> list[dict[str, Any]] | None:
    """Optional pre-request: assert collection variables exist before send."""
    if not injects:
        return None
    lines = [
        "// Auto-generated: ensure upstream collection variables exist",
    ]
    for spec in injects:
        var = spec.var.replace("\\", "\\\\").replace('"', '\\"')
        lines.append(
            f'if (!pm.collectionVariables.get("{var}")) {{'
            f' console.warn("Missing collection var: {var}"); }}',
        )
    script = "\n".join(lines)
    return [{"listen": "prerequest", "script": {"type": "text/javascript", "exec": script.split("\n")}}]


def merge_postman_events(
    *,
    extracts: list[ExtractSpec],
    injects: list[InjectSpec],
    expected_status: int | None = None,
) -> list[dict[str, Any]]:
    """Combine pre-request + test scripts for one collection item."""
    events: list[dict[str, Any]] = []
    pre = build_prerequest_script(injects)
    if pre:
        events.extend(pre)
    events.extend(build_extract_test_script(extracts, expected_status=expected_status))
    return events

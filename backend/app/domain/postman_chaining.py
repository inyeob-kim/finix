"""Postman Collection v2.1 scripts and placeholder bodies for scenario chaining."""

from __future__ import annotations

import json
import re
from typing import Any

from app.domain.scenario_bindings import ExtractSpec, InjectSpec, json_path_set, normalize_json_path_prefix
from app.domain.execution_assertion_catalog import (
    ERROR_INVALID_REQUEST,
    ERROR_RESPONSE_STRUCTURE,
    HAPPY_NO_ERROR_CODE,
    UNEXPECTED_SUCCESS,
    happy_status_test_name,
)

_PATH_SEGMENT = re.compile(r"[^.\[\]]+")


def _path_to_js_accessor(json_path: str, *, root: str = "res") -> str:
    """Build ``res?.a?.b`` from ``$.a.b`` (safe identifier segments only)."""
    raw = normalize_json_path_prefix(json_path)
    if raw.startswith("$."):
        raw = raw[2:]
    elif raw.startswith("$"):
        raw = raw[1:].lstrip(".")
    parts = [p for p in _PATH_SEGMENT.findall(raw) if p]
    if not parts:
        return root
    expr = root
    for part in parts:
        if part.isdigit():
            expr += f"[{part}]"
        elif re.match(r"^[A-Za-z_$][\w$]*$", part):
            expr += f".{part}"
        else:
            expr += f"[{json.dumps(part)}]"
    return expr


def is_postman_error_case(
    *,
    testcase_name: str = "",
    expected_status: int | None,
    expected_body: dict[str, Any] | None,
) -> bool:
    """True for YAML Error / [E] materialized cases."""
    if testcase_name.strip().startswith("[E]"):
        return True
    body = expected_body or {}
    if str(body.get("outcome") or "").strip().lower() == "error":
        return True
    return expected_status is not None and expected_status >= 400


def _error_detail_assertion_lines(expected_body: dict[str, Any] | None) -> list[str]:
    """BXMC CBS: ``messageId`` carries biz error code; ``message`` is localized text."""
    body = expected_body or {}
    error_code = str(body.get("error_code") or "").strip()
    if error_code:
        code_json = json.dumps(error_code, ensure_ascii=False)
        return [
            "    const bizCode = String("
            "res.messageId || res.errorCode || res.error_code || res.code || ''",
            "    );",
            f"    pm.expect(bizCode).to.eql({code_json});",
        ]
    args = body.get("error_args")
    if isinstance(args, list) and args:
        first = str(args[0]).strip().lstrip("@")
        if first:
            return [
                f"    pm.expect(String(res.message || '')).to.include({json.dumps(first, ensure_ascii=False)});",
            ]
    validation = str(body.get("validation_target") or "").strip()
    if validation:
        return [
            f"    pm.expect(String(res.message || '')).to.include({json.dumps(validation, ensure_ascii=False)});",
        ]
    return ["    pm.expect(res.message).to.be.a('string');"]


def effective_error_http_status(expected_status: int | None) -> int:
    """CBS BXMC returns HTTP 500 for BizApplicationException; prefer 500 in Postman/Live."""
    if expected_status is None or expected_status >= 500:
        return expected_status if expected_status is not None else 500
    # YAML often stores 400 while live CBS responds with 500
    return 500


def _error_http_status(expected_status: int | None) -> int:
    return effective_error_http_status(expected_status)


def _happy_case_test_lines(*, expected_status: int | None) -> list[str]:
    lines: list[str] = []
    status_name = happy_status_test_name(expected_status)
    if expected_status is not None:
        lines.extend(
            [
                f'pm.test("{status_name}", function () {{',
                f"  pm.response.to.have.status({expected_status});",
                "});",
            ],
        )
    else:
        lines.extend(
            [
                f'pm.test("{status_name}", function () {{',
                "  pm.expect(pm.response.code).to.be.within(200, 299);",
                "});",
            ],
        )
    lines.extend(
        [
            f'pm.test("{HAPPY_NO_ERROR_CODE}", function () {{',
            "  pm.expect(res.errorCode || res.code || '').to.eql('');",
            "});",
        ],
    )
    return lines


def _error_case_test_lines(
    *,
    expected_status: int | None,
    expected_body: dict[str, Any] | None,
) -> list[str]:
    status = _error_http_status(expected_status)
    lines = [
        "} else {",
        f'  pm.test("{ERROR_INVALID_REQUEST}", function () {{',
        f"    pm.expect(pm.response.code).to.eql({status});",
        "  });",
        f'  pm.test("{ERROR_RESPONSE_STRUCTURE}", function () {{',
        f"    pm.expect(res.status).to.eql({status});",
        "    pm.expect(res.exception).to.exist;",
    ]
    lines.extend(_error_detail_assertion_lines(expected_body))
    lines.append("  });")
    lines.append("}")
    return lines


def _extract_lines(extracts: list[ExtractSpec]) -> list[str]:
    if not extracts:
        return []
    lines = ["if (res && typeof res === 'object') {"]
    for spec in extracts:
        accessor = _path_to_js_accessor(spec.json_path)
        var = spec.var.replace("\\", "\\\\").replace('"', '\\"')
        lines.append("  try {")
        lines.append(f"    const v = {accessor};")
        lines.append("    if (v !== undefined && v !== null) {")
        lines.append(f'      pm.collectionVariables.set("{var}", String(v));')
        lines.append("    }")
        lines.append("  } catch (e) { /* skip */ }")
    lines.append("}")
    return lines


def build_postman_test_script(
    *,
    extracts: list[ExtractSpec],
    expected_status: int | None = None,
    expected_body: dict[str, Any] | None = None,
    testcase_name: str = "",
) -> list[dict[str, Any]]:
    """Postman ``test`` event: happy/error assertions + optional extract propagation."""
    is_error = is_postman_error_case(
        testcase_name=testcase_name,
        expected_status=expected_status,
        expected_body=expected_body,
    )
    lines = [
        "// Auto-generated: FINIX Postman response tests",
        "let body = {};",
        "try { body = pm.response.json(); } catch (e) {}",
        "const res = Array.isArray(body) ? body[0] : body;",
    ]
    if is_error:
        lines.append("if (pm.response.code >= 200 && pm.response.code < 300) {")
        lines.append(f'  pm.test("{UNEXPECTED_SUCCESS}", function () {{')
        lines.append('    pm.expect.fail("Expected error response");')
        lines.append("  });")
        lines.extend(
            _error_case_test_lines(
                expected_status=expected_status,
                expected_body=expected_body,
            ),
        )
    else:
        lines.extend(_happy_case_test_lines(expected_status=expected_status))
        lines.extend(_extract_lines(extracts))
    script = "\n".join(lines)
    return [{"listen": "test", "script": {"type": "text/javascript", "exec": script.split("\n")}}]


def build_extract_test_script(
    extracts: list[ExtractSpec],
    *,
    expected_status: int | None = None,
) -> list[dict[str, Any]]:
    """Backward-compatible wrapper for success-path extract scripts."""
    return build_postman_test_script(
        extracts=extracts,
        expected_status=expected_status,
        expected_body={"outcome": "success"},
        testcase_name="[N] legacy",
    )


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
    expected_body: dict[str, Any] | None = None,
    testcase_name: str = "",
) -> list[dict[str, Any]]:
    """Combine pre-request + test scripts for one collection item."""
    events: list[dict[str, Any]] = []
    pre = build_prerequest_script(injects)
    if pre:
        events.extend(pre)
    events.extend(
        build_postman_test_script(
            extracts=extracts,
            expected_status=expected_status,
            expected_body=expected_body,
            testcase_name=testcase_name,
        ),
    )
    return events

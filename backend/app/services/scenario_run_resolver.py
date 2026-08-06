"""Resolve scenario test-case request bodies with declarative bindings (pure logic)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from app.domain.collection_var_generators import CatalogGeneratorSpec
from app.domain.dynamic_macro_resolver import resolve_mapping
from app.domain.scenario_bindings import (
    ExtractSpec,
    InjectSpec,
    OverrideSpec,
    apply_extracts,
    apply_injects,
    apply_overrides,
    parse_extracts,
    parse_injects,
    parse_overrides,
)
from app.domain.step_http_result import StepHttpResult, coerce_step_http_result
from app.models.fnx_testcase import FnxTestcase
from app.utils.json_text import loads_json
from app.utils.scenario_steps_document import parse_steps_list


@dataclass(slots=True)
class ResolvedTestCaseStep:
    """One testcase row after template + inject resolution."""

    inst_cd: str
    svc_code: str
    rule_case_id: str
    step_index: int
    name: str
    method: str | None
    endpoint: str | None
    template_request_body: dict[str, Any]
    resolved_request_body: dict[str, Any]
    inject_warnings: list[str]
    expected_status: int | None
    expected_response_body: dict[str, Any]
    actual_status: int | None = None
    actual_body: Any = None
    context_after_step: dict[str, Any] | None = None
    response_time_ms: int | None = None
    response_size_bytes: int | None = None
    request_url: str | None = None


@dataclass(slots=True)
class ScenarioResolvePreview:
    """Full dry-run trace for UI preview and Postman export."""

    steps: list[ResolvedTestCaseStep]
    context_after: dict[str, Any]
    global_warnings: list[str]


def bindings_by_logical_step(
    steps_json: str | None,
) -> dict[int, tuple[list[InjectSpec], list[ExtractSpec], list[OverrideSpec]]]:
    """Map scenario step number (0-based) to inject/extract/override specs."""
    raw_steps = parse_steps_list(loads_json(steps_json, []))
    out: dict[int, tuple[list[InjectSpec], list[ExtractSpec], list[OverrideSpec]]] = {}
    for item in raw_steps:
        if not isinstance(item, dict):
            continue
        number = item.get("number")
        if not isinstance(number, int) or number < 1:
            continue
        step_idx = number - 1
        out[step_idx] = (
            parse_injects(item.get("injects")),
            parse_extracts(item.get("extracts")),
            parse_overrides(item.get("overrides")),
        )
    return out


def resolve_one_testcase_step(
    tc: FnxTestcase,
    *,
    idx: int,
    bindings: dict[int, tuple[list[InjectSpec], list[ExtractSpec], list[OverrideSpec]]],
    context: dict[str, Any],
    simulate_response: Callable[
        [FnxTestcase, dict[str, Any]], StepHttpResult | tuple[int, Any]
    ]
    | None = None,
    generator_catalog: dict[str, CatalogGeneratorSpec] | None = None,
    pool_fields: dict[str, Any] | None = None,
) -> tuple[ResolvedTestCaseStep, dict[str, Any], list[str]]:
    """
    Resolve one testcase step and optionally call HTTP/simulate.

    ``idx`` is the testcase's position within the ordered list for this run,
    which is also its logical scenario step index (one FnxTestcase per step).

    Returns:
        Resolved step, updated context, and new global warning strings.
    """
    logical_step = idx
    injects, extracts, overrides = bindings.get(logical_step, ([], [], []))
    raw_body = loads_json(tc.request_body_json, {})
    template = raw_body if isinstance(raw_body, dict) else {}
    exp_raw = loads_json(tc.expected_body_json, {})
    expected_resp = exp_raw if isinstance(exp_raw, dict) else {}
    warnings: list[str] = []

    macro_warnings: list[str] = []
    body_after_macros = resolve_mapping(
        template,
        context=context,
        pool_fields=pool_fields,
        catalog=generator_catalog,
        on_missing="keep",
        warnings=macro_warnings,
    )
    if macro_warnings:
        warnings.extend(f"Step {logical_step + 1}: {w}" for w in macro_warnings)

    body_after_overrides = apply_overrides(body_after_macros, overrides)
    resolved_body, inject_warnings = apply_injects(
        body_after_overrides,
        context,
        injects,
    )
    if inject_warnings:
        warnings.extend(inject_warnings)

    next_context = dict(context)
    actual_status: int | None = None
    actual_body: Any = None
    response_time_ms: int | None = None
    response_size_bytes: int | None = None
    request_url: str | None = None
    if simulate_response is not None:
        raw = simulate_response(tc, resolved_body)
        http = coerce_step_http_result(raw)
        actual_status = http.status
        actual_body = http.body
        response_time_ms = http.response_time_ms
        response_size_bytes = http.response_size_bytes
        request_url = http.request_url
        if isinstance(actual_body, (dict, list)):
            next_context = apply_extracts(actual_body, next_context, extracts)
        elif actual_body is not None:
            warnings.append(
                f"Step {logical_step + 1}: response body is not JSON object/array; extracts skipped",
            )

    step = ResolvedTestCaseStep(
        inst_cd=tc.inst_cd,
        svc_code=tc.svc_code,
        rule_case_id=tc.rule_case_id,
        step_index=logical_step,
        name=tc.name,
        method=tc.http_method,
        endpoint=tc.endpoint,
        template_request_body=template,
        resolved_request_body=resolved_body,
        inject_warnings=list(inject_warnings) + list(macro_warnings),
        expected_status=tc.expected_status,
        expected_response_body=expected_resp,
        actual_status=actual_status,
        actual_body=actual_body,
        context_after_step=dict(next_context),
        response_time_ms=response_time_ms,
        response_size_bytes=response_size_bytes,
        request_url=request_url,
    )
    return step, next_context, warnings


def resolve_scenario_run(
    testcases: list[FnxTestcase],
    *,
    steps_json: str | None,
    initial_context: dict[str, Any] | None = None,
    simulate_response: Callable[
        [FnxTestcase, dict[str, Any]], StepHttpResult | tuple[int, Any]
    ]
    | None = None,
    generator_catalog: dict[str, CatalogGeneratorSpec] | None = None,
    pool_fields: dict[str, Any] | None = None,
) -> ScenarioResolvePreview:
    """
    Walk testcases in order; resolve YAML macros, apply injects; optionally run responses.

    Order per step:
    1. Load template body
    2. Resolve Finix dynamic macros (date/generator/pool/context)
    3. Apply scenario overrides
    4. Apply injects from context
    5. Optional HTTP / simulate for extracts
    """
    bindings = bindings_by_logical_step(steps_json)
    context: dict[str, Any] = dict(initial_context or {})
    global_warnings: list[str] = []
    resolved_steps: list[ResolvedTestCaseStep] = []

    for idx, tc in enumerate(testcases):
        step, context, warnings = resolve_one_testcase_step(
            tc,
            idx=idx,
            bindings=bindings,
            context=context,
            simulate_response=simulate_response,
            generator_catalog=generator_catalog,
            pool_fields=pool_fields,
        )
        global_warnings.extend(warnings)
        resolved_steps.append(step)

    return ScenarioResolvePreview(
        steps=resolved_steps,
        context_after=context,
        global_warnings=global_warnings,
    )

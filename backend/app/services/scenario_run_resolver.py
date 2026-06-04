"""Resolve scenario test-case request bodies with declarative bindings (pure logic)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

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
from app.models.testcase import TestCase
from app.utils.json_text import loads_json
from app.utils.scenario_steps_document import parse_steps_list


@dataclass(slots=True)
class ResolvedTestCaseStep:
    """One testcase row after template + inject resolution."""

    testcase_id: int
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


def resolve_scenario_run(
    testcases: list[TestCase],
    *,
    steps_json: str | None,
    initial_context: dict[str, Any] | None = None,
    simulate_response: Callable[
        [TestCase, dict[str, Any]], tuple[int, Any]
    ]
    | None = None,
) -> ScenarioResolvePreview:
    """
    Walk testcases in order; apply injects per logical step; optionally simulate responses for extracts.

    When ``simulate_response`` is provided, context is updated after each testcase using that step's
    extract specs (stub or real HTTP). When omitted, only inject resolution runs.
    """
    bindings = bindings_by_logical_step(steps_json)
    context: dict[str, Any] = dict(initial_context or {})
    global_warnings: list[str] = []
    resolved_steps: list[ResolvedTestCaseStep] = []

    for idx, tc in enumerate(testcases):
        logical_step = tc.step_index if tc.step_index is not None else idx
        injects, extracts, overrides = bindings.get(logical_step, ([], [], []))
        raw_body = loads_json(tc.request_body_json, {})
        template = raw_body if isinstance(raw_body, dict) else {}
        exp_raw = loads_json(tc.expected_body_json, {})
        expected_resp = exp_raw if isinstance(exp_raw, dict) else {}
        body_after_overrides = apply_overrides(template, overrides)
        resolved_body, inject_warnings = apply_injects(
            body_after_overrides,
            context,
            injects,
        )
        if inject_warnings:
            global_warnings.extend(inject_warnings)

        actual_status: int | None = None
        actual_body: Any = None
        if simulate_response is not None:
            actual_status, actual_body = simulate_response(tc, resolved_body)
            if isinstance(actual_body, dict):
                context = apply_extracts(actual_body, context, extracts)
            else:
                global_warnings.append(
                    f"Step {logical_step + 1}: response body is not a JSON object; extracts skipped",
                )

        resolved_steps.append(
            ResolvedTestCaseStep(
                testcase_id=tc.id,
                step_index=logical_step,
                name=tc.name,
                method=tc.http_method,
                endpoint=tc.endpoint,
                template_request_body=template,
                resolved_request_body=resolved_body,
                inject_warnings=list(inject_warnings),
                expected_status=tc.expected_status,
                expected_response_body=expected_resp,
                actual_status=actual_status,
                actual_body=actual_body,
            )
        )

    return ScenarioResolvePreview(
        steps=resolved_steps,
        context_after=context,
        global_warnings=global_warnings,
    )

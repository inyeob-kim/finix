"""Schemas for scenario resolve-preview API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.domain.scenario_bindings import ExtractSpec, InjectSpec
from app.schemas.scenario_schema import ScenarioStepRead
from app.services.scenario_run_resolver import ResolvedTestCaseStep, ScenarioResolvePreview


class ResolvedTestCaseStepRead(BaseModel):
    """One testcase in resolve order with template vs resolved bodies."""

    testcase_id: int
    step_index: int
    name: str
    method: str | None
    endpoint: str | None
    template_request_body: dict[str, Any]
    resolved_request_body: dict[str, Any]
    inject_warnings: list[str] = Field(default_factory=list)
    expected_status: int | None = None
    expected_response_body: dict[str, Any] = Field(default_factory=dict)
    simulated_response_body: dict[str, Any] | None = Field(
        default=None,
        description="Stub/local preview response used for extract chain.",
    )


class ScenarioResolvePreviewRead(BaseModel):
    """Dry-run binding resolution for a scenario or inline definition."""

    steps: list[ResolvedTestCaseStepRead]
    context_after: dict[str, Any] = Field(default_factory=dict)
    global_warnings: list[str] = Field(default_factory=list)


class ScenarioResolvePreviewInlineRequest(BaseModel):
    """Resolve before a scenario is saved (registry wizard)."""

    steps: list[ScenarioStepRead] = Field(default_factory=list)
    per_step: list[list[int]] = Field(
        ...,
        description="Testcase ids per logical step, in run order within each step.",
    )
    simulate_responses: bool = Field(
        default=True,
        description="Use stub simulator to propagate extracts through the chain.",
    )


def _step_to_read(row: ResolvedTestCaseStep) -> ResolvedTestCaseStepRead:
    return ResolvedTestCaseStepRead(
        testcase_id=row.testcase_id,
        step_index=row.step_index,
        name=row.name,
        method=row.method,
        endpoint=row.endpoint,
        template_request_body=row.template_request_body,
        resolved_request_body=row.resolved_request_body,
        inject_warnings=row.inject_warnings,
        expected_status=row.expected_status,
        expected_response_body=row.expected_response_body,
        simulated_response_body=(
            row.actual_body if isinstance(row.actual_body, dict) else None
        ),
    )


def preview_to_read(preview: ScenarioResolvePreview) -> ScenarioResolvePreviewRead:
    return ScenarioResolvePreviewRead(
        steps=[_step_to_read(s) for s in preview.steps],
        context_after=preview.context_after,
        global_warnings=preview.global_warnings,
    )

"""Pydantic schemas for execution API contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.execution_run import ExecutionRun
from app.models.execution_step_result import ExecutionStepResult
from app.utils.json_text import loads_json


class ExecutionRunRequest(BaseModel):
    """Payload to trigger a test execution."""

    testcase_id: int = Field(..., ge=1)
    runner_name: str | None = Field(
        default=None,
        description="Optional registry name; defaults to first available runner.",
    )


class ExecutionRunResponse(BaseModel):
    """Outcome of a legacy single-testcase execution request."""

    execution_id: int
    testcase_id: int
    status: str
    message: str | None
    started_at: datetime


class ExecutionCreateV1(BaseModel):
    """Start a multi-step execution for all cases under a scenario."""

    scenario_id: int = Field(..., ge=1)
    base_url: str = Field(
        default="",
        max_length=2048,
        description="Target SUT base URL; empty uses deterministic stub only.",
    )


class ExecutionStepReadV1(BaseModel):
    """One step inside an execution detail response."""

    step_index: int
    step_label: str
    testcase_id: int | None
    status: Literal["passed", "failed"]
    expected: dict[str, Any]
    actual: dict[str, Any]
    error_message: str | None


class ExecutionDetailReadV1(BaseModel):
    """Full execution aggregate for UI."""

    id: int
    scenario_id: int | None
    base_url: str
    status: str
    summary: dict[str, Any]
    created_at: datetime
    steps: list[ExecutionStepReadV1]


class ExecutionListItemV1(BaseModel):
    """Execution row for history listing."""

    id: int
    scenario_id: int | None
    base_url: str
    status: str
    summary: dict[str, Any]
    created_at: datetime


class ExecutionListResponseV1(BaseModel):
    """Paginated execution history."""

    items: list[ExecutionListItemV1]
    total: int
    limit: int
    offset: int


def _step_to_read(row: ExecutionStepResult) -> ExecutionStepReadV1:
    st: Literal["passed", "failed"] = (
        "passed" if row.status == "passed" else "failed"
    )
    return ExecutionStepReadV1(
        step_index=row.step_index,
        step_label=row.step_label,
        testcase_id=row.testcase_id,
        status=st,
        expected=loads_json(row.expected_json, {}),
        actual=loads_json(row.actual_json, {}),
        error_message=row.error_message,
    )


def execution_run_to_detail(run: ExecutionRun) -> ExecutionDetailReadV1:
    """Map ORM run with loaded steps to API model."""
    steps = sorted(run.execution_step_results, key=lambda r: r.step_index)
    return ExecutionDetailReadV1(
        id=run.id,
        scenario_id=run.scenario_id,
        base_url=run.base_url,
        status=run.status,
        summary=loads_json(run.summary_json, {}),
        created_at=run.created_at,
        steps=[_step_to_read(s) for s in steps],
    )


def execution_run_to_list_item(run: ExecutionRun) -> ExecutionListItemV1:
    """Map ORM run without steps to list item."""
    return ExecutionListItemV1(
        id=run.id,
        scenario_id=run.scenario_id,
        base_url=run.base_url,
        status=run.status,
        summary=loads_json(run.summary_json, {}),
        created_at=run.created_at,
    )

"""Dashboard / KPI schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PoolKpiRead(BaseModel):
    total: int
    happy: int
    negative: int
    by_source: dict[str, int] = Field(default_factory=dict)
    by_service: list[dict[str, int | str]] = Field(default_factory=list)


class ExecutionKpiRead(BaseModel):
    runs_total: int
    runs_completed: int
    steps_passed: int
    steps_failed: int
    assertion_passed: int
    assertion_failed: int
    expected_error_passed: int
    expected_error_failed: int
    happy_replay_passed: int
    happy_replay_failed: int


class DashboardOverviewRead(BaseModel):
    pool: PoolKpiRead
    executions: ExecutionKpiRead


class BulkStatusRead(BaseModel):
    configured: bool
    directory: str | None = None
    url: str | None = None
    file_count: int = 0
    message: str


class PoolServiceCoverageRead(BaseModel):
    service_code: str
    total: int
    happy: int
    negative: int


class PoolCoverageResponse(BaseModel):
    items: list[PoolServiceCoverageRead]
    service_count: int

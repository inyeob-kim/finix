"""Pydantic schemas for scenario API contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.scenario import Scenario
from app.utils.json_text import dumps_json, loads_json


class ScenarioStepRead(BaseModel):
    """One scenario step returned to clients."""

    id: str
    number: int
    action: str
    result: Literal["success", "error"]
    reason: str | None = None
    service_code: str | None = Field(
        default=None,
        description="SRVC_CD when known; preferred over parsing ``reason``.",
    )


class ScenarioRead(BaseModel):
    """Full scenario projection for API responses."""

    id: int
    title: str
    description: str | None
    content: str | None
    prompt: str | None
    steps: list[ScenarioStepRead]
    is_saved: bool
    created_at: datetime


class ScenarioCreateV1(BaseModel):
    """Create scenario from natural language."""

    prompt: str = Field(..., min_length=1, max_length=4000)
    title: str | None = Field(default=None, max_length=255)


class ScenarioPatchV1(BaseModel):
    """Partial update for scenario fields."""

    title: str | None = Field(default=None, max_length=255)
    prompt: str | None = Field(default=None, max_length=4000)
    steps: list[ScenarioStepRead] | None = None


class ScenarioAttachTestCasesRequest(BaseModel):
    """Map pool test cases onto a scenario in step order."""

    per_step: list[list[int]] = Field(
        ...,
        description="Index i matches scenario step i; inner list is testcase ids in run order.",
    )


class ScenarioListRead(BaseModel):
    """Scenario summary for list endpoints."""

    id: int
    title: str
    prompt: str | None
    is_saved: bool
    created_at: datetime


def scenario_entity_to_read(entity: Scenario) -> ScenarioRead:
    """Map ORM scenario to API read model."""
    raw_steps: list[Any] = loads_json(entity.steps_json, [])
    steps_out: list[ScenarioStepRead] = []
    for item in raw_steps:
        if not isinstance(item, dict):
            continue
        try:
            steps_out.append(ScenarioStepRead.model_validate(item))
        except Exception:
            continue
    return ScenarioRead(
        id=entity.id,
        title=entity.title,
        description=entity.description,
        content=entity.content,
        prompt=entity.prompt,
        steps=steps_out,
        is_saved=bool(entity.is_saved),
        created_at=entity.created_at,
    )


def steps_to_json(steps: list[ScenarioStepRead]) -> str:
    """Serialize validated steps for persistence."""
    return dumps_json([s.model_dump() for s in steps])

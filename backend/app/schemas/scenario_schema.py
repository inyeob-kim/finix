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


class ScenarioRefineRequest(BaseModel):
    """User instruction for AI-assisted scenario refinement."""

    instruction: str = Field(..., min_length=1, max_length=2000)


class ScenarioListRead(BaseModel):
    """Scenario summary for list endpoints."""

    id: int
    title: str
    prompt: str | None
    is_saved: bool
    created_at: datetime


class ScenarioGenerateRequest(BaseModel):
    """Payload for legacy scenario generation."""

    title: str = Field(..., min_length=1, max_length=255)
    prompt: str | None = Field(
        default=None,
        description="Optional natural language input used by the generator.",
    )


class ScenarioResponse(BaseModel):
    """Legacy scenario response (extended fields for newer clients)."""

    id: int
    title: str
    description: str | None
    content: str | None
    created_at: datetime
    prompt: str | None = None
    steps: list[ScenarioStepRead] = Field(default_factory=list)
    is_saved: bool = False


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


def scenario_entity_to_legacy_response(entity: Scenario) -> ScenarioResponse:
    """Map ORM scenario to legacy response shape."""
    read = scenario_entity_to_read(entity)
    return ScenarioResponse(
        id=read.id,
        title=read.title,
        description=read.description,
        content=read.content,
        created_at=read.created_at,
        prompt=read.prompt,
        steps=read.steps,
        is_saved=read.is_saved,
    )


def steps_to_json(steps: list[ScenarioStepRead]) -> str:
    """Serialize validated steps for persistence."""
    return dumps_json([s.model_dump() for s in steps])

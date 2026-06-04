"""Pydantic schemas for scenario API contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.domain.postman_collection_config import PostmanCollectionConfig
from app.domain.scenario_bindings import ExtractSpec, InjectSpec, OverrideSpec
from app.models.scenario import Scenario
from app.utils.json_text import dumps_json, loads_json
from app.utils.scenario_steps_document import dump_steps_document, parse_steps_document


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
    extracts: list[ExtractSpec] = Field(
        default_factory=list,
        description="After this step runs, copy fields from response body into scenario context.",
    )
    injects: list[InjectSpec] = Field(
        default_factory=list,
        description="Before this step runs, merge context variables into request body.",
    )
    overrides: list[OverrideSpec] = Field(
        default_factory=list,
        description="Before this step runs, set fixed literal values on request body fields.",
    )


class ScenarioRead(BaseModel):
    """Full scenario projection for API responses."""

    id: int
    title: str
    description: str | None
    content: str | None
    prompt: str | None
    steps: list[ScenarioStepRead]
    postman: PostmanCollectionConfig | None = None
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
    raw_steps, postman = parse_steps_document(entity.steps_json)
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
        postman=postman,
        is_saved=bool(entity.is_saved),
        created_at=entity.created_at,
    )


def steps_to_json(
    steps: list[ScenarioStepRead],
    postman: PostmanCollectionConfig | None = None,
) -> str:
    """Serialize validated steps (and optional Postman config) for persistence."""
    return dump_steps_document([s.model_dump() for s in steps], postman)

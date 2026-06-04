"""API schemas for AI/heuristic scenario binding suggestions."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.domain.scenario_bindings import ExtractSpec, InjectSpec


class ScenarioBindingsSuggestRequest(BaseModel):
    """Ordered service codes in the scenario registry wizard."""

    service_codes: list[str] = Field(
        ...,
        min_length=1,
        max_length=20,
        description="SRVC_CD list in run order.",
    )


class SuggestedBindingLinkRead(BaseModel):
    """One extract+inject pair across two steps."""

    from_service_index: int = Field(ge=0)
    to_service_index: int = Field(ge=0)
    from_service_code: str
    to_service_code: str
    response_path: str
    request_path: str
    var: str
    confidence: Literal["high", "medium", "low"] = "medium"
    reason: str | None = None


class StepBindingsBlockRead(BaseModel):
    """Per-service extract/inject lists (UI-ready)."""

    service_code: str
    extracts: list[ExtractSpec] = Field(default_factory=list)
    injects: list[InjectSpec] = Field(default_factory=list)


class ScenarioBindingsSuggestRead(BaseModel):
    """Suggested bindings for review before save."""

    source: Literal["llm", "heuristic", "hybrid"] = "heuristic"
    summary: str
    links: list[SuggestedBindingLinkRead] = Field(default_factory=list)
    bindings_by_service: dict[str, StepBindingsBlockRead] = Field(default_factory=dict)
    link_count: int = 0

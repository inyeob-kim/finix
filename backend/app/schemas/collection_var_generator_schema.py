"""API schemas for collection variable generators."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class CollectionVarGeneratorRead(BaseModel):
    key: str
    label: str
    description: str = ""
    hint: str = ""
    source: Literal["builtin", "shared"] = "builtin"
    impl_kind: str | None = None
    impl: dict[str, Any] = Field(default_factory=dict)
    prompt: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None


class CollectionVarGeneratorListRead(BaseModel):
    items: list[CollectionVarGeneratorRead] = Field(default_factory=list)


class CollectionVarGeneratorDraftRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)


class CollectionVarGeneratorRecommendationRead(BaseModel):
    key: str
    label: str
    source: Literal["builtin", "shared"] = "builtin"
    reason: str = ""
    sample_preview: str = ""


class CollectionVarGeneratorDraftRead(BaseModel):
    """AI draft result: existing matches and/or a new generator draft."""

    key: str = ""
    label: str = ""
    description: str = ""
    impl_kind: str = ""
    impl: dict[str, Any] = Field(default_factory=dict)
    sample_preview: str = ""
    source: Literal["llm", "heuristic"] = "heuristic"
    recommendations: list[CollectionVarGeneratorRecommendationRead] = Field(
        default_factory=list,
    )
    has_draft: bool = False



class CollectionVarGeneratorCreateRequest(BaseModel):
    key: str = Field(..., min_length=2, max_length=64)
    label: str = Field(..., min_length=1, max_length=128)
    description: str = Field(default="", max_length=512)
    prompt: str = Field(default="", max_length=2000)
    impl_kind: str = Field(..., min_length=1, max_length=32)
    impl: dict[str, Any] = Field(default_factory=dict)
    created_by: str = Field(default="", max_length=64)


class CollectionVarGeneratorUpdateRequest(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    prompt: str | None = Field(default=None, max_length=2000)
    impl_kind: str | None = Field(default=None, min_length=1, max_length=32)
    impl: dict[str, Any] | None = None


class CollectionVarGeneratorPreviewRequest(BaseModel):
    """Preview by catalog key, or by raw impl_kind+impl (AI draft)."""

    key: str | None = None
    impl_kind: str | None = None
    impl: dict[str, Any] = Field(default_factory=dict)


class CollectionVarGeneratorPreviewRead(BaseModel):
    value: str

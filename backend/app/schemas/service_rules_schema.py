"""Pydantic schemas for service rules (DB primary)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ServiceRuleBundleRead(BaseModel):
    id: int
    service_code: str
    service_name_snapshot: str | None = None
    status: str
    version: int
    source_version: str | None = None
    checksum: str
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    # For preview/use
    yaml_text: str | None = None
    rules: dict[str, Any] | None = None


class ServiceRuleDraftCreate(BaseModel):
    yaml_text: str = Field(min_length=1)
    source_version: str | None = None
    created_by: str | None = None


class ServiceRuleRollbackRequest(BaseModel):
    to_version: int = Field(ge=1)


class ServiceRuleGenerateDraftRequest(BaseModel):
    objective: str | None = None
    include_existing: bool = True
    created_by: str | None = None


class ServiceRuleGenerateFromSourceRequest(BaseModel):
    """Paste backend source; LLM emits template-shaped YAML, persisted as a draft bundle."""

    source_code: str = Field(min_length=16, max_length=150_000)
    source_version: str | None = Field(
        default=None,
        max_length=128,
        description="Label stored on the bundle, e.g. branch or commit id.",
    )
    hints: str | None = Field(default=None, max_length=4000)
    created_by: str | None = Field(default=None, max_length=128)


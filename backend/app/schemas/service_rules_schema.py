"""Pydantic schemas for service rules (DB primary)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ServiceRuleRegistryItemRead(BaseModel):
    """One row per service for Rules/Meta list UI."""

    service_code: str
    service_name: str
    source_version: str | None = None
    status: str
    rules: int = Field(ge=0)
    bundle_id: int
    bundle_version: int
    last_updated_at: datetime | None = None
    last_updated_by: str | None = None
    is_active: bool = False
    version_count: int = Field(default=0, ge=0)
    active_bundle_version: int | None = None
    draft_bundle_version: int | None = None
    has_approved: bool = False


class ServiceRuleRegistryListResponse(BaseModel):
    items: list[ServiceRuleRegistryItemRead]
    total: int
    limit: int
    offset: int


class ServiceRuleBundleRead(BaseModel):
    id: int
    service_code: str
    service_name_snapshot: str | None = None
    status: str
    is_active: bool = False
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


class ServiceRuleDraftUpdate(BaseModel):
    yaml_text: str = Field(min_length=1)
    source_version: str | None = None
    created_by: str | None = None


class ServiceRuleValidateYamlRequest(BaseModel):
    yaml_text: str = Field(min_length=1)


class ServiceRuleValidateYamlResponse(BaseModel):
    ok: Literal[True] = True
    service_name: str | None = None
    rule_count: int = Field(ge=0)


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


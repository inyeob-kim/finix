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
    bundle_version: int = 0
    last_updated_at: datetime | None = None
    last_updated_by: str | None = None
    is_active: bool = False
    version_count: int = Field(default=0, ge=0)
    active_bundle_version: int | None = None
    draft_bundle_version: int | None = None
    has_approved: bool = False
    has_draft: bool = False
    history_count: int = Field(default=0, ge=0)


class ServiceRuleRegistryListResponse(BaseModel):
    items: list[ServiceRuleRegistryItemRead]
    total: int
    limit: int
    offset: int


class ServiceRuleBundleRead(BaseModel):
    """Editor/history document DTO (kept name for API compatibility)."""

    id: int
    service_code: str
    service_name_snapshot: str | None = None
    status: str
    is_active: bool = False
    version: int = 0
    source_version: str | None = None
    checksum: str
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    yaml_text: str | None = None
    rules: dict[str, Any] | None = None
    has_draft: bool = False
    change_kind: str | None = None


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
    """Restore from history. ``to_version`` is history_id (legacy field name)."""

    to_version: int = Field(ge=1, description="History snapshot id")



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
    use_data_pool: bool = Field(
        default=False,
        description="Optional: inject Data Pool happy-sample field hints (Graceful Skip if empty).",
    )
    use_swagger: bool = Field(
        default=False,
        description="Optional: inject OpenAPI operation hints (Graceful Skip if empty).",
    )


class PostmanRulesImportRequest(BaseModel):
    """Postman Collection v2.1 or single Request JSON → draft YAML upsert."""

    collection: Any = Field(
        description="Postman Collection object, single request export, or item list.",
    )
    overwrite_draft: bool = Field(
        default=False,
        description="When true, replace existing working drafts for matched services.",
    )
    created_by: str | None = Field(default=None, max_length=128)


class PostmanUnmatchedRequestRead(BaseModel):
    name: str
    method: str
    path: str


class PostmanServiceImportResultRead(BaseModel):
    service_code: str
    mode: str
    engine: str
    draft_id: int
    diff: dict[str, Any]
    notes: list[str] = Field(default_factory=list)


class PostmanRulesImportResponse(BaseModel):
    services: list[PostmanServiceImportResultRead]
    unmatched: list[PostmanUnmatchedRequestRead]


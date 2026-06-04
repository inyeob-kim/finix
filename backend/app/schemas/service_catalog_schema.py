"""Pydantic schemas for service catalog endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ServiceCatalogItemRead(BaseModel):
    service_code: str
    service_name: str
    http_method: str
    uri: str
    source: str
    source_version: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ServiceCatalogDtoSkeletonsRead(BaseModel):
    """In/Out OMM skeleton from CBS catalog for binding UI."""

    service_code: str
    found: bool
    input_dto_name: str | None = None
    output_dto_name: str | None = None
    input_skeleton: dict = Field(default_factory=dict)
    output_skeleton: dict = Field(default_factory=dict)
    input_field_count: int = 0
    output_field_count: int = 0


class ServiceCatalogImportResult(BaseModel):
    source: str
    source_version: str | None = None
    upserted: int = Field(ge=0)


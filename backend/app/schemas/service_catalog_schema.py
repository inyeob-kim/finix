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


class ServiceCatalogImportResult(BaseModel):
    source: str
    source_version: str | None = None
    upserted: int = Field(ge=0)


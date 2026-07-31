"""Pydantic schemas for data pool, log ingest, and OpenAPI ingest."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


PathKind = Literal["happy", "negative"]
LogSource = Literal["paste", "file_upload", "server_bulk", "runner_feedback"]


class ParsedExchangeRead(BaseModel):
    method: str
    endpoint: str
    http_status: int | None = None
    service_code: str | None = None
    cbb_header: dict[str, Any] = Field(default_factory=dict)
    request_body: Any = None
    response_body: Any = None
    biz_error_code: str | None = None
    path_kind: PathKind = "happy"
    parse_warnings: list[str] = Field(default_factory=list)


class LogParseRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Pasted log text or JSON exchanges")


class LogParseResponse(BaseModel):
    exchanges: list[ParsedExchangeRead]
    count: int
    happy_count: int
    negative_count: int


class LogCommitRequest(BaseModel):
    text: str | None = Field(
        default=None,
        description="Optional raw text to re-parse before commit",
    )
    exchanges: list[ParsedExchangeRead] | None = None
    source: LogSource = "paste"


class LogCommitResult(BaseModel):
    created: int
    updated: int
    total: int
    sample_ids: list[int]


class BulkIngestRequest(BaseModel):
    """Server bulk pull request. Connector may be unconfigured in Phase 1."""

    created_from: datetime | None = None
    created_to: datetime | None = None
    service_code: str | None = None
    """Optional raw dump when connector is not wired yet (ops paste of server export)."""
    log_text: str | None = None


class BulkIngestResponse(BaseModel):
    status: Literal["ok", "not_configured", "empty"]
    message: str
    commit: LogCommitResult | None = None


class PoolSampleRead(BaseModel):
    id: int
    api_operation_id: int | None = None
    service_code: str | None = None
    method: str
    endpoint: str
    path_kind: PathKind
    http_status: int | None = None
    biz_error_code: str | None = None
    cbb_header: dict[str, Any] | None = None
    request_body: Any = None
    response_body: Any = None
    source: str
    source_fingerprint: str
    quality_score: float
    created_at: datetime | None = None
    last_seen_at: datetime | None = None


class PoolSampleListResponse(BaseModel):
    items: list[PoolSampleRead]
    total: int
    happy_total: int
    negative_total: int


class OpenApiImportResult(BaseModel):
    document_id: int
    name: str
    version: str | None
    operations_upserted: int
    checksum: str
    reused_document: bool = False


class ApiOperationRead(BaseModel):
    id: int
    openapi_document_id: int | None = None
    service_code: str | None = None
    method: str
    path: str
    operation_id: str | None = None
    summary: str | None = None
    created_at: datetime | None = None


class OpenApiDocumentRead(BaseModel):
    id: int
    name: str
    version: str | None
    checksum: str
    imported_at: datetime | None = None
    operation_count: int = 0


class PromoteSampleRequest(BaseModel):
    replace_existing: bool = False


class PromoteByServiceRequest(BaseModel):
    service_code: str = Field(..., min_length=1)
    path_kind: PathKind | None = None
    replace_existing: bool = False


class PromoteResult(BaseModel):
    testcase_id: int
    pool_sample_id: int | None = None
    name: str
    reused: bool = False


class PromoteBatchResult(BaseModel):
    items: list[PromoteResult]
    count: int

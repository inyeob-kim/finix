"""API: parse and commit transaction logs into the data pool."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.deps import get_log_ingest_service
from app.schemas.dashboard_schema import BulkStatusRead
from app.schemas.data_pool_schema import (
    BulkIngestRequest,
    BulkIngestResponse,
    LogCommitRequest,
    LogCommitResult,
    LogParseRequest,
    LogParseResponse,
    ParsedExchangeRead,
)
from app.services.log_ingest_service import LogIngestService, mapping_to_exchange

router = APIRouter(prefix="/log-ingest")


def _to_read(ex) -> ParsedExchangeRead:
    return ParsedExchangeRead(
        method=ex.method,
        endpoint=ex.endpoint,
        http_status=ex.http_status,
        service_code=ex.service_code,
        cbb_header=ex.cbb_header or {},
        request_body=ex.request_body,
        response_body=ex.response_body,
        biz_error_code=ex.biz_error_code,
        path_kind=ex.path_kind,  # type: ignore[arg-type]
        parse_warnings=list(ex.parse_warnings or []),
    )


@router.post("/parse", response_model=LogParseResponse, summary="Parse pasted log text")
async def parse_logs(
    payload: LogParseRequest,
    service: LogIngestService = Depends(get_log_ingest_service),
) -> LogParseResponse:
    exchanges = service.parse(payload.text)
    reads = [_to_read(e) for e in exchanges]
    return LogParseResponse(
        exchanges=reads,
        count=len(reads),
        happy_count=sum(1 for e in reads if e.path_kind == "happy"),
        negative_count=sum(1 for e in reads if e.path_kind == "negative"),
    )


@router.post("/commit", response_model=LogCommitResult, summary="Commit exchanges to data pool")
async def commit_logs(
    payload: LogCommitRequest,
    service: LogIngestService = Depends(get_log_ingest_service),
) -> LogCommitResult:
    if payload.exchanges:
        exchanges = [
            mapping_to_exchange(e.model_dump())
            for e in payload.exchanges
        ]
        result = await service.commit_exchanges(exchanges, source=payload.source)
    elif payload.text and payload.text.strip():
        result = await service.commit_from_text(payload.text, source=payload.source)
    else:
        from app.core.exceptions import InvalidInputError

        raise InvalidInputError("text 또는 exchanges가 필요합니다.")
    return LogCommitResult(**result)


@router.get(
    "/bulk-status",
    response_model=BulkStatusRead,
    summary="Bulk connector configuration status",
)
async def bulk_status(
    service: LogIngestService = Depends(get_log_ingest_service),
) -> BulkStatusRead:
    return BulkStatusRead(**(await service.bulk_status()))


@router.post(
    "/bulk",
    response_model=BulkIngestResponse,
    summary="Bulk ingest from server connector or server log dump",
)
async def bulk_ingest(
    payload: BulkIngestRequest,
    service: LogIngestService = Depends(get_log_ingest_service),
) -> BulkIngestResponse:
    result = await service.bulk_ingest(
        log_text=payload.log_text,
        service_code=payload.service_code,
    )
    commit = result.get("commit")
    return BulkIngestResponse(
        status=result["status"],
        message=result["message"],
        commit=LogCommitResult(**commit) if commit else None,
    )

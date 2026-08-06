"""HTTP routes for executions (v1)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.core.deps import get_execution_service, require_active_inst_cd
from app.schemas.execution_schema import (
    ExecutionCreateV1,
    ExecutionDetailReadV1,
    ExecutionListResponseV1,
    execution_run_to_detail,
    execution_run_to_list_item,
)
from app.services.execution_service import ExecutionService
from app.utils.sse import SSE_HEADERS, sse_stream_events

router = APIRouter(prefix="/executions")


@router.post("", response_model=ExecutionDetailReadV1, summary="Run scenario tests")
async def create_execution_v1(
    payload: ExecutionCreateV1,
    service: ExecutionService = Depends(get_execution_service),
    inst_cd: str = Depends(require_active_inst_cd),
) -> ExecutionDetailReadV1:
    """Execute all test cases for a scenario and return structured results."""
    run = await service.create_run_for_scenario(
        scenario_id=payload.scenario_id,
        base_url=payload.base_url,
        mode=payload.mode,
        inst_cd=inst_cd,
    )
    return execution_run_to_detail(run)


@router.post("/stream", summary="Run scenario tests with SSE progress")
async def create_execution_stream_v1(
    payload: ExecutionCreateV1,
    service: ExecutionService = Depends(get_execution_service),
    inst_cd: str = Depends(require_active_inst_cd),
) -> StreamingResponse:
    """Execute a scenario and stream per-step progress as Server-Sent Events."""
    events = service.iter_run_for_scenario(
        scenario_id=payload.scenario_id,
        base_url=payload.base_url,
        mode=payload.mode,
        inst_cd=inst_cd,
    )
    return StreamingResponse(
        sse_stream_events(events, fallback_message="시나리오 실행에 실패했습니다."),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.get("", response_model=ExecutionListResponseV1, summary="List executions")
async def list_executions_v1(
    service: ExecutionService = Depends(get_execution_service),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    scenario_id: int | None = Query(default=None, ge=1),
) -> ExecutionListResponseV1:
    """Paginated execution history."""
    rows, total = await service.list_runs_page(
        limit=limit,
        offset=offset,
        created_from=created_from,
        created_to=created_to,
        scenario_id=scenario_id,
    )
    return ExecutionListResponseV1(
        items=[execution_run_to_list_item(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{execution_id}", response_model=ExecutionDetailReadV1, summary="Get execution")
async def get_execution_v1(
    execution_id: int,
    service: ExecutionService = Depends(get_execution_service),
) -> ExecutionDetailReadV1:
    """Return one execution with per-step outcomes."""
    run = await service.get_run(execution_id)
    return execution_run_to_detail(run)

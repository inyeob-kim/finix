"""HTTP routes for executions (v1)."""

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_execution_service
from app.schemas.execution_schema import (
    ExecutionCreateV1,
    ExecutionDetailReadV1,
    ExecutionListResponseV1,
    execution_run_to_detail,
    execution_run_to_list_item,
)
from app.services.execution_service import ExecutionService

router = APIRouter(prefix="/executions")


@router.post("", response_model=ExecutionDetailReadV1, summary="Run scenario tests")
async def create_execution_v1(
    payload: ExecutionCreateV1,
    service: ExecutionService = Depends(get_execution_service),
) -> ExecutionDetailReadV1:
    """Execute all test cases for a scenario and return structured results."""
    run = await service.create_run_for_scenario(
        scenario_id=payload.scenario_id,
        base_url=payload.base_url,
    )
    return execution_run_to_detail(run)


@router.get("", response_model=ExecutionListResponseV1, summary="List executions")
async def list_executions_v1(
    service: ExecutionService = Depends(get_execution_service),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ExecutionListResponseV1:
    """Paginated execution history."""
    rows, total = await service.list_runs_page(limit=limit, offset=offset)
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

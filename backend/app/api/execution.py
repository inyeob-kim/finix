"""HTTP routes for execution operations."""

from fastapi import APIRouter, Depends

from app.core.deps import get_execution_service
from app.schemas.execution_schema import ExecutionRunRequest, ExecutionRunResponse
from app.services.execution_service import ExecutionService

router = APIRouter()


@router.post(
    "/run",
    response_model=ExecutionRunResponse,
    summary="Run a test case and persist the outcome",
)
async def run_execution(
    payload: ExecutionRunRequest,
    service: ExecutionService = Depends(get_execution_service),
) -> ExecutionRunResponse:
    """
    Trigger a (stub) execution for the given test case id.

    Args:
        payload: Validated execution request.
        service: Injected execution service.

    Returns:
        Normalized execution response built from the persistence layer.
    """
    log = await service.run_testcase(
        testcase_id=payload.testcase_id,
        runner_name=payload.runner_name,
    )
    return ExecutionRunResponse(
        execution_id=log.id,
        testcase_id=log.testcase_id,
        status=log.status,
        message=log.detail,
        started_at=log.created_at,
    )

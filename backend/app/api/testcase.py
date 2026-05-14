"""HTTP routes for test case operations."""

from fastapi import APIRouter, Depends

from app.core.deps import get_testcase_service
from app.schemas.testcase_schema import TestCaseGenerateRequest, TestCaseResponse
from app.services.testcase_service import TestCaseService

router = APIRouter()


@router.post(
    "/generate",
    response_model=TestCaseResponse,
    summary="Generate and persist a test case",
)
async def generate_testcase(
    payload: TestCaseGenerateRequest,
    service: TestCaseService = Depends(get_testcase_service),
) -> TestCaseResponse:
    """
    Accept a generation request and return the persisted test case.

    Args:
        payload: Validated request body.
        service: Injected test case service.

    Returns:
        API response model mapped from the stored entity.
    """
    entity = await service.generate_testcase(
        name=payload.name,
        scenario_id=payload.scenario_id,
        objective=payload.objective,
    )
    return TestCaseResponse.model_validate(entity)

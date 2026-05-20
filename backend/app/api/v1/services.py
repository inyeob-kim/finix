"""HTTP routes for per-service operations (test case pool, etc.)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.deps import get_testcase_service
from app.schemas.testcase_schema import TestCaseRead, testcase_entity_to_read
from app.services.testcase_service import TestCaseService

router = APIRouter(prefix="/services")


class MaterializePoolRequest(BaseModel):
    instruction: str | None = Field(default=None, max_length=2000)
    replace_existing: bool = True


@router.post(
    "/{service_code}/test-cases/materialize",
    response_model=list[TestCaseRead],
    summary="Materialize service-level test case pool from active rules",
)
async def materialize_test_case_pool(
    service_code: str,
    payload: MaterializePoolRequest = MaterializePoolRequest(),
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> list[TestCaseRead]:
    """Create HTTP test cases for one service (no scenario) from active or file YAML."""
    rows = await testcase_service.materialize_pool_for_service(
        service_code,
        instruction=payload.instruction,
        replace_existing=payload.replace_existing,
    )
    return [testcase_entity_to_read(r) for r in rows]

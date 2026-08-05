"""HTTP routes for per-service operations (test case pool, etc.)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.deps import get_execution_service, get_testcase_service
from app.schemas.execution_schema import (
    ExecutionDetailReadV1,
    TestCaseExecutionCreateV1,
    execution_run_to_detail,
)
from app.schemas.testcase_schema import TestCaseRead, testcase_entity_to_read
from app.services.execution_service import ExecutionService
from app.services.testcase_service import TestCaseService

router = APIRouter(prefix="/services")


class MaterializePoolRequest(BaseModel):
    instruction: str | None = Field(default=None, max_length=2000)
    replace_existing: bool = True
    bundle_id: int | None = Field(default=None, ge=1)
    yaml_text: str | None = Field(
        default=None,
        description="Editor YAML; when set, materialize from this document.",
    )


@router.post(
    "/{service_code}/test-cases/materialize",
    response_model=list[TestCaseRead],
    summary="Materialize service-level test case pool from YAML rules",
)
async def materialize_test_case_pool(
    service_code: str,
    payload: MaterializePoolRequest = MaterializePoolRequest(),
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> list[TestCaseRead]:
    """Create HTTP test cases for one service (no scenario) from YAML rules."""
    rows = await testcase_service.materialize_pool_for_service(
        service_code,
        instruction=payload.instruction,
        replace_existing=payload.replace_existing,
        bundle_id=payload.bundle_id,
        yaml_text=payload.yaml_text,
    )
    return [testcase_entity_to_read(r) for r in rows]


@router.post(
    "/{service_code}/test-cases/executions",
    response_model=ExecutionDetailReadV1,
    summary="Run all pool test cases for a service",
)
async def run_service_test_cases_v1(
    service_code: str,
    payload: TestCaseExecutionCreateV1 = TestCaseExecutionCreateV1(),
    execution_service: ExecutionService = Depends(get_execution_service),
) -> ExecutionDetailReadV1:
    """Execute every materialized test case for the service as one multi-step run."""
    run = await execution_service.create_run_for_service_testcases(
        service_code=service_code,
        base_url=payload.base_url,
        mode=payload.mode,
        postman_config=payload.postman,
    )
    return execution_run_to_detail(run)


@router.get(
    "/{service_code}/test-cases/export/postman",
    summary="Export all pool test cases as one Postman collection",
)
async def export_service_test_cases_postman_v1(
    service_code: str,
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> JSONResponse:
    """Return a Postman Collection v2.1 with BXM scripts and response tests."""
    collection = await testcase_service.build_postman_for_service_export(
        service_code,
    )
    return JSONResponse(content=collection)

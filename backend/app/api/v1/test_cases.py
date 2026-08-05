"""HTTP routes for test cases by id (v1)."""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from app.core.deps import get_execution_service, get_testcase_service
from app.schemas.execution_schema import (
    ExecutionDetailReadV1,
    TestCaseExecutionCreateV1,
    execution_run_to_detail,
)
from app.schemas.testcase_schema import TestCasePatchV1, TestCaseRead, testcase_entity_to_read
from app.services.execution_service import ExecutionService
from app.services.testcase_service import TestCaseService

router = APIRouter(prefix="/test-cases")


@router.get(
    "",
    response_model=list[TestCaseRead],
    summary="List test cases by service code",
)
async def list_test_cases_by_service_v1(
    service_code: str = Query(..., min_length=1, description="CBS SRVC_CD 등"),
    limit: int = Query(default=200, ge=1, le=500),
    service: TestCaseService = Depends(get_testcase_service),
) -> list[TestCaseRead]:
    """Return HTTP test cases linked to the given service (DB rows)."""
    rows = await service.list_by_service_code(service_code, limit=limit)
    return [testcase_entity_to_read(r) for r in rows]


@router.get("/{testcase_id}", response_model=TestCaseRead, summary="Get test case")
async def get_test_case_v1(
    testcase_id: int,
    service: TestCaseService = Depends(get_testcase_service),
) -> TestCaseRead:
    """Return one HTTP test case."""
    entity = await service.get_testcase(testcase_id)
    return testcase_entity_to_read(entity)


@router.patch("/{testcase_id}", response_model=TestCaseRead, summary="Update test case")
async def patch_test_case_v1(
    testcase_id: int,
    payload: TestCasePatchV1,
    service: TestCaseService = Depends(get_testcase_service),
) -> TestCaseRead:
    """Patch fields on a generated test case."""
    entity = await service.patch_testcase(
        testcase_id,
        name=payload.name,
        method=payload.method,
        endpoint=payload.endpoint,
        request_body=payload.request_body,
        expected_status=payload.expected_status,
        expected_body=payload.expected_body,
        step_index=payload.step_index,
    )
    return testcase_entity_to_read(entity)


@router.post(
    "/{testcase_id}/executions",
    response_model=ExecutionDetailReadV1,
    summary="Run a single test case",
)
async def run_test_case_v1(
    testcase_id: int,
    payload: TestCaseExecutionCreateV1 = TestCaseExecutionCreateV1(),
    execution_service: ExecutionService = Depends(get_execution_service),
) -> ExecutionDetailReadV1:
    """Execute one pool/standalone test case and return structured results."""
    run = await execution_service.create_run_for_testcase(
        testcase_id=testcase_id,
        base_url=payload.base_url,
        mode=payload.mode,
        postman_config=payload.postman,
    )
    return execution_run_to_detail(run)


@router.get(
    "/{testcase_id}/export/postman",
    summary="Export Postman collection JSON",
)
async def export_postman_v1(
    testcase_id: int,
    mode: str = Query(default="template", pattern="^(template|resolved)$"),
    scenario_id: int | None = Query(default=None, ge=1),
    service: TestCaseService = Depends(get_testcase_service),
) -> JSONResponse:
    """Return a Postman Collection v2.1 JSON document with BXM scripts/tests."""
    collection = await service.build_postman_for_testcase_export(
        testcase_id,
        mode=mode,
        scenario_id=scenario_id,
    )
    return JSONResponse(content=collection)

"""HTTP routes for test cases by natural key (v1)."""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from app.core.deps import (
    get_execution_service,
    get_testcase_service,
    require_active_inst_cd,
)
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
    inst_cd: str = Depends(require_active_inst_cd),
    limit: int = Query(default=200, ge=1, le=500),
    scenario_eligible: bool = Query(
        default=False,
        description="When true, only 확정(활성) rule cases (for scenario attachment).",
    ),
    service: TestCaseService = Depends(get_testcase_service),
) -> list[TestCaseRead]:
    """Return HTTP test cases linked to the given service (fnx_testcase rows)."""
    rows = await service.list_by_service_code(
        service_code,
        limit=limit,
        inst_cd=inst_cd,
        scenario_eligible=scenario_eligible,
    )
    return await service.to_reads(rows)


@router.get(
    "/{svc_code}/{rule_case_id}",
    response_model=TestCaseRead,
    summary="Get test case",
)
async def get_test_case_v1(
    svc_code: str,
    rule_case_id: str,
    inst_cd: str = Depends(require_active_inst_cd),
    service: TestCaseService = Depends(get_testcase_service),
) -> TestCaseRead:
    """Return one HTTP test case by natural key."""
    entity = await service.get_testcase(inst_cd, svc_code, rule_case_id)
    return await service.to_read(entity)


@router.patch(
    "/{svc_code}/{rule_case_id}",
    response_model=TestCaseRead,
    summary="Update test case",
)
async def patch_test_case_v1(
    svc_code: str,
    rule_case_id: str,
    payload: TestCasePatchV1,
    inst_cd: str = Depends(require_active_inst_cd),
    service: TestCaseService = Depends(get_testcase_service),
) -> TestCaseRead:
    """Patch fields on a materialized test case."""
    entity = await service.patch_testcase(
        inst_cd,
        svc_code,
        rule_case_id,
        name=payload.name,
        method=payload.method,
        endpoint=payload.endpoint,
        request_body=payload.request_body,
        expected_status=payload.expected_status,
        expected_body=payload.expected_body,
    )
    return await service.to_read(entity)


@router.post(
    "/{svc_code}/{rule_case_id}/executions",
    response_model=ExecutionDetailReadV1,
    summary="Run a single test case",
)
async def run_test_case_v1(
    svc_code: str,
    rule_case_id: str,
    payload: TestCaseExecutionCreateV1 = TestCaseExecutionCreateV1(),
    inst_cd: str = Depends(require_active_inst_cd),
    execution_service: ExecutionService = Depends(get_execution_service),
) -> ExecutionDetailReadV1:
    """Execute one pool/standalone test case and return structured results."""
    run = await execution_service.create_run_for_testcase(
        inst_cd=inst_cd,
        svc_code=svc_code,
        rule_case_id=rule_case_id,
        base_url=payload.base_url,
        mode=payload.mode,
        postman_config=payload.postman,
    )
    return execution_run_to_detail(run)


@router.get(
    "/{svc_code}/{rule_case_id}/export/postman",
    summary="Export Postman collection JSON",
)
async def export_postman_v1(
    svc_code: str,
    rule_case_id: str,
    mode: str = Query(default="template", pattern="^(template|resolved)$"),
    scenario_id: int | None = Query(default=None, ge=1),
    inst_cd: str = Depends(require_active_inst_cd),
    service: TestCaseService = Depends(get_testcase_service),
) -> JSONResponse:
    """Return a Postman Collection v2.1 JSON document with BXM scripts/tests."""
    collection = await service.build_postman_for_testcase_export(
        inst_cd,
        svc_code,
        rule_case_id,
        mode=mode,
        scenario_id=scenario_id,
    )
    return JSONResponse(content=collection)

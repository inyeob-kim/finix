"""HTTP routes for per-service operations (test case pool, etc.)."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

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
from app.schemas.testcase_schema import TestCaseRead, testcase_entity_to_read
from app.services.execution_service import ExecutionService
from app.services.testcase_service import TestCaseService
from app.utils.sse import SSE_HEADERS, sse_stream_events

router = APIRouter(prefix="/services")


class MaterializePoolRequest(BaseModel):
    instruction: str | None = Field(default=None, max_length=2000)
    replace_existing: bool = True
    bundle_id: int | None = Field(default=None, ge=1)
    yaml_text: str | None = Field(
        default=None,
        description="Editor YAML; when set, materialize from this document.",
    )


class MaterializeCaseRequest(BaseModel):
    instruction: str | None = Field(default=None, max_length=2000)
    bundle_id: int | None = Field(default=None, ge=1)
    yaml_text: str | None = Field(
        default=None,
        description="Editor YAML; when set, take this case from the document.",
    )


class RunRuleCaseRequest(BaseModel):
    instruction: str | None = Field(default=None, max_length=2000)
    bundle_id: int | None = Field(default=None, ge=1)
    yaml_text: str | None = Field(
        default=None,
        description="Editor YAML used to upsert TC before run (apply not required).",
    )
    base_url: str = Field(default="", max_length=2048)
    mode: Literal["simulate", "live"] = "simulate"
    postman: dict[str, Any] | None = None


class RunRuleCaseResponse(BaseModel):
    testcase: TestCaseRead
    execution: ExecutionDetailReadV1


@router.post(
    "/{service_code}/test-cases/materialize",
    response_model=list[TestCaseRead],
    summary="Materialize service-level test case pool from YAML rules",
)
async def materialize_test_case_pool(
    service_code: str,
    payload: MaterializePoolRequest = MaterializePoolRequest(),
    inst_cd: str = Depends(require_active_inst_cd),
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> list[TestCaseRead]:
    """Create HTTP test cases for one service (no scenario) from YAML rules."""
    rows = await testcase_service.materialize_pool_for_service(
        service_code,
        instruction=payload.instruction,
        replace_existing=payload.replace_existing,
        bundle_id=payload.bundle_id,
        yaml_text=payload.yaml_text,
        inst_cd=inst_cd,
    )
    return await testcase_service.to_reads(rows)


@router.post(
    "/{service_code}/cases/{case_id}/materialize",
    response_model=TestCaseRead,
    summary="Upsert one pool test case for a rule case_id",
)
async def materialize_one_rule_case(
    service_code: str,
    case_id: str,
    payload: MaterializeCaseRequest = MaterializeCaseRequest(),
    inst_cd: str = Depends(require_active_inst_cd),
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> TestCaseRead:
    row = await testcase_service.materialize_one_case(
        service_code,
        case_id,
        instruction=payload.instruction,
        bundle_id=payload.bundle_id,
        yaml_text=payload.yaml_text,
        inst_cd=inst_cd,
    )
    return await testcase_service.to_read(row)


@router.post(
    "/{service_code}/cases/{case_id}/run",
    response_model=RunRuleCaseResponse,
    summary="Upsert TC for one rule case and execute it",
)
async def run_one_rule_case(
    service_code: str,
    case_id: str,
    payload: RunRuleCaseRequest = RunRuleCaseRequest(),
    inst_cd: str = Depends(require_active_inst_cd),
    testcase_service: TestCaseService = Depends(get_testcase_service),
    execution_service: ExecutionService = Depends(get_execution_service),
) -> RunRuleCaseResponse:
    """Primary Rules UX path: case → TC upsert → HTTP execution (no apply required)."""
    tc = await testcase_service.materialize_one_case(
        service_code,
        case_id,
        instruction=payload.instruction,
        bundle_id=payload.bundle_id,
        yaml_text=payload.yaml_text,
        inst_cd=inst_cd,
    )
    run = await execution_service.create_run_for_testcase(
        inst_cd=inst_cd,
        svc_code=tc.svc_code,
        rule_case_id=tc.rule_case_id,
        base_url=payload.base_url,
        mode=payload.mode,
        postman_config=payload.postman,
    )
    return RunRuleCaseResponse(
        testcase=testcase_entity_to_read(tc),
        execution=execution_run_to_detail(run),
    )


@router.post(
    "/{service_code}/test-cases/executions",
    response_model=ExecutionDetailReadV1,
    summary="Run all pool test cases for a service",
)
async def run_service_test_cases_v1(
    service_code: str,
    payload: TestCaseExecutionCreateV1 = TestCaseExecutionCreateV1(),
    inst_cd: str = Depends(require_active_inst_cd),
    execution_service: ExecutionService = Depends(get_execution_service),
) -> ExecutionDetailReadV1:
    """Execute every materialized test case for the service as one multi-step run."""
    run = await execution_service.create_run_for_service_testcases(
        service_code=service_code,
        base_url=payload.base_url,
        mode=payload.mode,
        postman_config=payload.postman,
        inst_cd=inst_cd,
    )
    return execution_run_to_detail(run)


@router.post(
    "/{service_code}/test-cases/executions/stream",
    summary="Run all pool test cases for a service with SSE progress",
)
async def run_service_test_cases_stream_v1(
    service_code: str,
    payload: TestCaseExecutionCreateV1 = TestCaseExecutionCreateV1(),
    inst_cd: str = Depends(require_active_inst_cd),
    execution_service: ExecutionService = Depends(get_execution_service),
) -> StreamingResponse:
    """Execute the service test case pool and stream per-case progress."""
    events = execution_service.iter_run_for_service_testcases(
        service_code=service_code,
        base_url=payload.base_url,
        mode=payload.mode,
        postman_config=payload.postman,
        inst_cd=inst_cd,
    )
    return StreamingResponse(
        sse_stream_events(events, fallback_message="테스트케이스 실행에 실패했습니다."),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.get(
    "/{service_code}/test-cases/export/postman",
    summary="Export all pool test cases as one Postman collection",
)
async def export_service_test_cases_postman_v1(
    service_code: str,
    inst_cd: str = Depends(require_active_inst_cd),
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> JSONResponse:
    """Return a Postman Collection v2.1 with BXM scripts and response tests."""
    collection = await testcase_service.build_postman_for_service_export(
        service_code,
        inst_cd=inst_cd,
    )
    return JSONResponse(content=collection)

"""API: Happy / Negative data pool browser and promote-to-testcase."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.deps import (
    get_pool_promote_service,
    get_pool_service,
    require_active_inst_cd,
)
from app.schemas.dashboard_schema import PoolCoverageResponse, PoolServiceCoverageRead
from app.schemas.data_pool_schema import (
    PoolSampleListResponse,
    PoolSampleRead,
    PromoteBatchResult,
    PromoteByServiceRequest,
    PromoteResult,
    PromoteSampleRequest,
)
from app.services.pool_promote_service import PoolPromoteService
from app.services.pool_service import PoolService

router = APIRouter(prefix="/data-pool")


@router.get(
    "/coverage",
    response_model=PoolCoverageResponse,
    summary="Pool coverage grouped by service_code",
)
async def pool_coverage(
    limit: int = Query(default=50, ge=1, le=200),
    service: PoolService = Depends(get_pool_service),
) -> PoolCoverageResponse:
    rows = await service.coverage_by_service(limit=limit)
    return PoolCoverageResponse(
        items=[PoolServiceCoverageRead(**r) for r in rows],
        service_count=len(rows),
    )


@router.get(
    "/samples",
    response_model=PoolSampleListResponse,
    summary="List data-pool samples",
)
async def list_pool_samples(
    service_code: str | None = Query(default=None),
    path_kind: str | None = Query(default=None, pattern="^(happy|negative)$"),
    source: str | None = Query(default=None),
    biz_error_code: str | None = Query(default=None),
    query: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: PoolService = Depends(get_pool_service),
) -> PoolSampleListResponse:
    data = await service.list_samples(
        service_code=service_code,
        path_kind=path_kind,
        source=source,
        biz_error_code=biz_error_code,
        query=query,
        limit=limit,
        offset=offset,
    )
    return PoolSampleListResponse(
        items=[PoolSampleRead(**row) for row in data["items"]],
        total=data["total"],
        happy_total=data["happy_total"],
        negative_total=data["negative_total"],
    )


@router.get(
    "/samples/{sample_id}",
    response_model=PoolSampleRead,
    summary="Get one data-pool sample",
)
async def get_pool_sample(
    sample_id: int,
    service: PoolService = Depends(get_pool_service),
) -> PoolSampleRead:
    row = await service.get_sample(sample_id)
    return PoolSampleRead(**row)


@router.post(
    "/samples/{sample_id}/promote",
    response_model=PromoteResult,
    summary="Promote one pool sample to a runnable testcase",
)
async def promote_pool_sample(
    sample_id: int,
    payload: PromoteSampleRequest | None = None,
    inst_cd: str = Depends(require_active_inst_cd),
    service: PoolPromoteService = Depends(get_pool_promote_service),
) -> PromoteResult:
    body = payload or PromoteSampleRequest()
    tc, reused = await service.promote_sample_with_meta(
        sample_id,
        inst_cd=inst_cd,
        replace_existing=body.replace_existing,
    )
    return PromoteResult(
        inst_cd=tc.inst_cd,
        svc_code=tc.svc_code,
        rule_case_id=tc.rule_case_id,
        pool_sample_id=tc.pool_sample_id,
        name=tc.name,
        reused=reused,
    )


@router.post(
    "/promote-by-service",
    response_model=PromoteBatchResult,
    summary="Promote all pool samples for a service_code",
)
async def promote_pool_by_service(
    payload: PromoteByServiceRequest,
    inst_cd: str = Depends(require_active_inst_cd),
    service: PoolPromoteService = Depends(get_pool_promote_service),
) -> PromoteBatchResult:
    rows = await service.promote_for_service(
        payload.service_code,
        inst_cd=inst_cd,
        path_kind=payload.path_kind,
        replace_existing=payload.replace_existing,
    )
    return PromoteBatchResult(
        items=[
            PromoteResult(
                inst_cd=tc.inst_cd,
                svc_code=tc.svc_code,
                rule_case_id=tc.rule_case_id,
                pool_sample_id=tc.pool_sample_id,
                name=tc.name,
                reused=False,
            )
            for tc in rows
        ],
        count=len(rows),
    )

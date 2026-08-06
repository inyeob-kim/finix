"""API: institution master and mock login."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_institution_service
from app.schemas.institution_schema import (
    InstitutionCreateRequest,
    InstitutionListResponse,
    InstitutionRead,
    LoginRequest,
    LoginResponse,
)
from app.services.institution_service import InstitutionService

institutions_router = APIRouter(prefix="/institutions")
auth_router = APIRouter(prefix="/auth")


@institutions_router.get(
    "",
    response_model=InstitutionListResponse,
    summary="List active institutions (login dropdown)",
)
async def list_institutions(
    active_only: bool = Query(default=True),
    service: InstitutionService = Depends(get_institution_service),
) -> InstitutionListResponse:
    if active_only:
        items = await service.list_active()
    else:
        items = await service.list_all()
    return InstitutionListResponse(
        items=[InstitutionRead(**row) for row in items],
        total=len(items),
    )


@institutions_router.get(
    "/{inst_cd}",
    response_model=InstitutionRead,
    summary="Get one institution",
)
async def get_institution(
    inst_cd: str,
    service: InstitutionService = Depends(get_institution_service),
) -> InstitutionRead:
    row = await service.get(inst_cd)
    return InstitutionRead(**row)


@institutions_router.post(
    "",
    response_model=InstitutionRead,
    summary="Create institution",
)
async def create_institution(
    payload: InstitutionCreateRequest,
    service: InstitutionService = Depends(get_institution_service),
) -> InstitutionRead:
    row = await service.create(
        inst_cd=payload.inst_cd,
        inst_nm=payload.inst_nm,
        is_active=payload.is_active,
        remark=payload.remark,
    )
    return InstitutionRead(**row)


@auth_router.post(
    "/login",
    response_model=LoginResponse,
    summary="Mock login bound to an active institution",
)
async def login(
    payload: LoginRequest,
    service: InstitutionService = Depends(get_institution_service),
) -> LoginResponse:
    result = await service.login(
        username=payload.username,
        role=payload.role,
        inst_cd=payload.inst_cd,
    )
    return LoginResponse(**result)

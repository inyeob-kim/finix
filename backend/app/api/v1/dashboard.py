"""API: Runner + Data Pool dashboard KPIs."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session
from app.schemas.dashboard_schema import DashboardOverviewRead
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard")


def get_dashboard_service(
    session: AsyncSession = Depends(get_async_session),
) -> DashboardService:
    return DashboardService(session)


@router.get(
    "/overview",
    response_model=DashboardOverviewRead,
    summary="Pool + execution KPI overview",
)
async def dashboard_overview(
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    service: DashboardService = Depends(get_dashboard_service),
) -> DashboardOverviewRead:
    data = await service.overview(created_from=created_from, created_to=created_to)
    return DashboardOverviewRead(**data)

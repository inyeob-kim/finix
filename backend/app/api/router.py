"""Central API router aggregating domain routes."""

from fastapi import APIRouter

from app.api import execution, scenario, testcase
from app.api.v1.router import api_v1_router

api_router = APIRouter()
api_router.include_router(api_v1_router, prefix="/api/v1")
api_router.include_router(scenario.router, prefix="/scenario", tags=["scenario"])
api_router.include_router(testcase.router, prefix="/testcase", tags=["testcase"])
api_router.include_router(execution.router, prefix="/execution", tags=["execution"])

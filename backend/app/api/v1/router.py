"""Aggregate router for ``/api/v1`` endpoints."""

from fastapi import APIRouter

from app.api.v1 import executions, rules_yaml, scenarios, service_catalog, service_rules, test_cases

api_v1_router = APIRouter()
api_v1_router.include_router(scenarios.router, tags=["scenarios"])
api_v1_router.include_router(test_cases.router, tags=["test-cases"])
api_v1_router.include_router(executions.router, tags=["executions"])
api_v1_router.include_router(rules_yaml.router, tags=["rules-yaml"])
api_v1_router.include_router(service_catalog.router, tags=["service-catalog"])
api_v1_router.include_router(service_rules.router, tags=["service-rules"])

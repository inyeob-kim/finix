"""Aggregate router for ``/api/v1`` endpoints."""

from fastapi import APIRouter

from app.api.v1 import (
    collection_var_generators,
    dashboard,
    data_pool,
    executions,
    log_ingest,
    manual,
    openapi_docs,
    rules_yaml,
    scenarios,
    service_catalog,
    service_rules,
    services,
    test_cases,
)

api_v1_router = APIRouter()
api_v1_router.include_router(scenarios.router, tags=["scenarios"])
api_v1_router.include_router(services.router, tags=["services"])
api_v1_router.include_router(test_cases.router, tags=["test-cases"])
api_v1_router.include_router(executions.router, tags=["executions"])
api_v1_router.include_router(rules_yaml.router, tags=["rules-yaml"])
api_v1_router.include_router(service_catalog.router, tags=["service-catalog"])
api_v1_router.include_router(service_rules.router, tags=["service-rules"])
api_v1_router.include_router(manual.router, tags=["manual"])
api_v1_router.include_router(data_pool.router, tags=["data-pool"])
api_v1_router.include_router(openapi_docs.router, tags=["openapi"])
api_v1_router.include_router(log_ingest.router, tags=["log-ingest"])
api_v1_router.include_router(dashboard.router, tags=["dashboard"])
api_v1_router.include_router(
    collection_var_generators.router,
    tags=["collection-var-generators"],
)

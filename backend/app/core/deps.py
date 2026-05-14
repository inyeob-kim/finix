"""FastAPI dependency providers wiring sessions, repositories, and services."""

from collections.abc import AsyncGenerator
from functools import lru_cache

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_async_session
from app.integrations.llm_client import LlmClient
from app.repositories.cbs_service_catalog_repo import CbsServiceCatalogRepository
from app.repositories.execution_repo import ExecutionRepository
from app.repositories.metadata_repo import MetadataRepository
from app.repositories.service_catalog_repo import ServiceCatalogRepository
from app.repositories.service_registry_repo import ServiceRegistryRepository
from app.repositories.service_rules_repo import ServiceRulesRepository
from app.services.execution_service import ExecutionService
from app.services.scenario_service import ScenarioService
from app.services.service_catalog_service import ServiceCatalogService
from app.services.service_rules_ai_service import ServiceRulesAiService
from app.services.service_rules_service import ServiceRulesService
from app.services.testcase_service import TestCaseService


async def get_metadata_repository(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[MetadataRepository, None]:
    """Yield a metadata repository bound to the request-scoped session."""
    yield MetadataRepository(session)


async def get_service_registry_repository(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[ServiceRegistryRepository, None]:
    """Yield a service registry repository bound to the request-scoped session."""
    yield ServiceRegistryRepository(session)


async def get_execution_repository(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[ExecutionRepository, None]:
    """Yield an execution repository bound to the request-scoped session."""
    yield ExecutionRepository(session)


async def get_service_catalog_repository(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[ServiceCatalogRepository, None]:
    """Yield a DB-backed service catalog repository."""
    yield ServiceCatalogRepository(session)


async def get_service_rules_repository(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[ServiceRulesRepository, None]:
    """Yield a DB-backed service rules repository."""
    yield ServiceRulesRepository(session)


@lru_cache
def get_cbs_service_catalog_repository() -> CbsServiceCatalogRepository:
    """Return shared JSON catalog repository instance."""
    settings = get_settings()
    return CbsServiceCatalogRepository(settings.cbs_service_json_path)


@lru_cache
def get_llm_client() -> LlmClient | None:
    """Return configured LLM client or None when disabled."""
    settings = get_settings()
    if not settings.llm_api_key:
        return None
    return LlmClient(
        api_key=settings.llm_api_key.get_secret_value(),
        model=settings.llm_model,
        base_url=settings.llm_base_url,
        temperature=settings.llm_temperature,
    )


def get_scenario_service(
    metadata_repo: MetadataRepository = Depends(get_metadata_repository),
    registry_repo: ServiceRegistryRepository = Depends(get_service_registry_repository),
    cbs_catalog_repo: CbsServiceCatalogRepository = Depends(
        get_cbs_service_catalog_repository
    ),
    llm_client: LlmClient | None = Depends(get_llm_client),
) -> ScenarioService:
    """Build ScenarioService with injected repositories."""
    return ScenarioService(
        metadata_repo=metadata_repo,
        registry_repo=registry_repo,
        cbs_catalog_repo=cbs_catalog_repo,
        llm_client=llm_client,
    )


def get_testcase_service(
    metadata_repo: MetadataRepository = Depends(get_metadata_repository),
    registry_repo: ServiceRegistryRepository = Depends(get_service_registry_repository),
    cbs_catalog_repo: CbsServiceCatalogRepository = Depends(
        get_cbs_service_catalog_repository
    ),
    service_rules_repo: ServiceRulesRepository = Depends(get_service_rules_repository),
) -> TestCaseService:
    """Build TestCaseService with injected repositories."""
    return TestCaseService(
        metadata_repo=metadata_repo,
        registry_repo=registry_repo,
        cbs_catalog_repo=cbs_catalog_repo,
        service_rules_repo=service_rules_repo,
    )


def get_service_catalog_service(
    catalog_repo: ServiceCatalogRepository = Depends(get_service_catalog_repository),
    cbs_catalog_repo: CbsServiceCatalogRepository = Depends(get_cbs_service_catalog_repository),
) -> ServiceCatalogService:
    """Build ServiceCatalogService with injected repositories."""
    return ServiceCatalogService(
        catalog_repo=catalog_repo,
        cbs_json_repo=cbs_catalog_repo,
    )


def get_service_rules_service(
    repo: ServiceRulesRepository = Depends(get_service_rules_repository),
) -> ServiceRulesService:
    """Build ServiceRulesService with injected repositories."""
    return ServiceRulesService(repo=repo)


def get_service_rules_ai_service(
    llm: LlmClient | None = Depends(get_llm_client),
    catalog_repo: ServiceCatalogRepository = Depends(get_service_catalog_repository),
    rules_service: ServiceRulesService = Depends(get_service_rules_service),
) -> ServiceRulesAiService:
    """Build ServiceRulesAiService. Requires LLM key configured."""
    if llm is None:
        raise RuntimeError("LLM is not configured (LLM_API_KEY missing).")
    return ServiceRulesAiService(
        llm=llm,
        catalog_repo=catalog_repo,
        rules_service=rules_service,
    )


def get_execution_service(
    metadata_repo: MetadataRepository = Depends(get_metadata_repository),
    registry_repo: ServiceRegistryRepository = Depends(get_service_registry_repository),
    execution_repo: ExecutionRepository = Depends(get_execution_repository),
) -> ExecutionService:
    """Build ExecutionService with injected repositories."""
    return ExecutionService(
        metadata_repo=metadata_repo,
        registry_repo=registry_repo,
        execution_repo=execution_repo,
    )

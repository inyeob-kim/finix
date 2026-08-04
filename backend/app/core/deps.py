"""FastAPI dependency providers wiring sessions, repositories, and services."""

from collections.abc import AsyncGenerator
from functools import lru_cache

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_async_session
from app.integrations.llm_client import LlmClient
from app.repositories.collection_var_generator_repo import (
    CollectionVarGeneratorRepository,
)
from app.repositories.cbs_service_catalog_repo import CbsServiceCatalogRepository
from app.repositories.execution_repo import ExecutionRepository
from app.repositories.metadata_repo import MetadataRepository
from app.repositories.openapi_repo import OpenApiRepository
from app.repositories.pool_sample_repo import PoolSampleRepository
from app.repositories.service_catalog_repo import ServiceCatalogRepository
from app.repositories.service_registry_repo import ServiceRegistryRepository
from app.repositories.manual_chunk_repo import ManualChunkRepository
from app.repositories.service_rules_repo import ServiceRulesRepository
from app.services.collection_var_generator_service import CollectionVarGeneratorService
from app.services.execution_service import ExecutionService
from app.services.log_ingest_service import LogIngestService
from app.services.openapi_ingest_service import OpenApiIngestService
from app.services.pool_promote_service import PoolPromoteService
from app.services.pool_service import PoolService
from app.services.scenario_bindings_ai_service import ScenarioBindingsAiService
from app.services.scenario_resolve_service import ScenarioResolveService
from app.services.manual_rag_service import ManualRagService
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


async def get_manual_chunk_repository(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[ManualChunkRepository, None]:
    """Yield manual RAG chunk repository."""
    yield ManualChunkRepository(session)


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
        provider=settings.llm_provider,
        base_url=settings.llm_base_url,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
        timeout_seconds=settings.llm_timeout_seconds,
    )


@lru_cache
def get_embedding_llm_client() -> LlmClient | None:
    """
    OpenAI-compatible client for manual RAG embeddings.

    Uses LLM_EMBEDDING_API_KEY when set; otherwise reuses the main client only if
    LLM_PROVIDER is openai.
    """
    settings = get_settings()
    if settings.llm_embedding_api_key:
        return LlmClient(
            api_key=settings.llm_embedding_api_key.get_secret_value(),
            model=settings.llm_embedding_model,
            provider="openai",
            base_url=settings.llm_embedding_base_url,
            temperature=0.0,
            max_tokens=4096,
            timeout_seconds=120.0,
        )
    main = get_llm_client()
    if main is None:
        return None
    provider = (settings.llm_provider or "openai").strip().lower()
    if provider in {"anthropic", "claude"}:
        return None
    return main


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


async def get_pool_sample_repository(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[PoolSampleRepository, None]:
    """Yield pool sample repository."""
    yield PoolSampleRepository(session)


async def get_openapi_repository(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[OpenApiRepository, None]:
    """Yield OpenAPI document repository."""
    yield OpenApiRepository(session)


def get_pool_service(
    pool_repo: PoolSampleRepository = Depends(get_pool_sample_repository),
) -> PoolService:
    """Build PoolService."""
    return PoolService(pool_repo)


def get_pool_promote_service(
    pool_repo: PoolSampleRepository = Depends(get_pool_sample_repository),
    metadata_repo: MetadataRepository = Depends(get_metadata_repository),
    registry_repo: ServiceRegistryRepository = Depends(get_service_registry_repository),
) -> PoolPromoteService:
    """Build PoolPromoteService."""
    return PoolPromoteService(
        pool_repo=pool_repo,
        metadata_repo=metadata_repo,
        registry_repo=registry_repo,
    )


def get_log_ingest_service(
    pool_repo: PoolSampleRepository = Depends(get_pool_sample_repository),
) -> LogIngestService:
    """Build LogIngestService."""
    return LogIngestService(pool_repo)


def get_openapi_ingest_service(
    openapi_repo: OpenApiRepository = Depends(get_openapi_repository),
    catalog_repo: ServiceCatalogRepository = Depends(get_service_catalog_repository),
) -> OpenApiIngestService:
    """Build OpenApiIngestService."""
    return OpenApiIngestService(
        openapi_repo=openapi_repo,
        catalog_repo=catalog_repo,
    )


def get_service_rules_ai_service(
    llm: LlmClient | None = Depends(get_llm_client),
    catalog_repo: ServiceCatalogRepository = Depends(get_service_catalog_repository),
    rules_service: ServiceRulesService = Depends(get_service_rules_service),
    pool_service: PoolService = Depends(get_pool_service),
    openapi_service: OpenApiIngestService = Depends(get_openapi_ingest_service),
) -> ServiceRulesAiService:
    """Build ServiceRulesAiService. Requires LLM key configured."""
    if llm is None:
        raise HTTPException(
            status_code=503,
            detail="LLM이 설정되지 않았습니다. backend/.env 에 LLM_API_KEY를 설정하세요.",
        )
    return ServiceRulesAiService(
        llm=llm,
        catalog_repo=catalog_repo,
        rules_service=rules_service,
        pool_service=pool_service,
        openapi_service=openapi_service,
    )


def get_manual_rag_service(
    repo: ManualChunkRepository = Depends(get_manual_chunk_repository),
    llm: LlmClient | None = Depends(get_llm_client),
    embedding_llm: LlmClient | None = Depends(get_embedding_llm_client),
) -> ManualRagService:
    """Build ManualRagService. Chat = main LLM; index/search = embedding LLM."""
    if llm is None:
        raise HTTPException(
            status_code=503,
            detail="LLM이 설정되지 않았습니다. backend/.env 에 LLM_API_KEY를 설정하세요.",
        )
    if embedding_llm is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "매뉴얼 RAG 임베딩용 OpenAI 호환 API 키가 필요합니다. "
                "LLM_PROVIDER=anthropic 인 경우 backend/.env 에 "
                "LLM_EMBEDDING_API_KEY(sk-... OpenAI)를 추가하세요."
            ),
        )
    settings = get_settings()
    return ManualRagService(
        repo=repo,
        llm=llm,
        embedding_llm=embedding_llm,
        manual_path=settings.manual_md_path,
        manual_docs_dir=settings.manual_docs_dir,
        embedding_model=settings.llm_embedding_model,
    )


def get_scenario_resolve_service(
    metadata_repo: MetadataRepository = Depends(get_metadata_repository),
) -> ScenarioResolveService:
    """Build ScenarioResolveService for binding preview."""
    return ScenarioResolveService(metadata_repo=metadata_repo)


def get_scenario_bindings_ai_service(
    catalog_service: ServiceCatalogService = Depends(get_service_catalog_service),
    cbs_catalog_repo: CbsServiceCatalogRepository = Depends(
        get_cbs_service_catalog_repository
    ),
    llm: LlmClient | None = Depends(get_llm_client),
) -> ScenarioBindingsAiService:
    """Build binding suggest service (LLM optional; heuristic fallback)."""
    return ScenarioBindingsAiService(
        catalog_service=catalog_service,
        cbs_repo=cbs_catalog_repo,
        llm=llm,
    )


async def get_collection_var_generator_repository(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[CollectionVarGeneratorRepository, None]:
    yield CollectionVarGeneratorRepository(session)


def get_collection_var_generator_service(
    repo: CollectionVarGeneratorRepository = Depends(
        get_collection_var_generator_repository,
    ),
    llm: LlmClient | None = Depends(get_llm_client),
) -> CollectionVarGeneratorService:
    return CollectionVarGeneratorService(repo=repo, llm=llm)


def get_execution_service(
    metadata_repo: MetadataRepository = Depends(get_metadata_repository),
    registry_repo: ServiceRegistryRepository = Depends(get_service_registry_repository),
    execution_repo: ExecutionRepository = Depends(get_execution_repository),
    generator_service: CollectionVarGeneratorService = Depends(
        get_collection_var_generator_service,
    ),
) -> ExecutionService:
    """Build ExecutionService with injected repositories."""
    return ExecutionService(
        metadata_repo=metadata_repo,
        registry_repo=registry_repo,
        execution_repo=execution_repo,
        generator_service=generator_service,
    )

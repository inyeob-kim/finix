"""HTTP routes for scenarios (v1)."""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.deps import (
    get_cbs_service_catalog_repository,
    get_scenario_bindings_ai_service,
    get_scenario_resolve_service,
    get_scenario_service,
    get_service_catalog_service,
    get_testcase_service,
)
from app.repositories.cbs_service_catalog_repo import CbsServiceCatalogRepository
from app.schemas.scenario_bindings_suggest_schema import (
    ScenarioBindingsSuggestRead,
    ScenarioBindingsSuggestRequest,
)
from app.domain.postman_collection_config import PostmanCollectionConfig
from app.schemas.scenario_schema import (
    ScenarioAttachTestCasesRequest,
    ScenarioCreateV1,
    ScenarioListRead,
    ScenarioPatchV1,
    ScenarioRead,
    ScenarioStepRead,
    scenario_entity_to_read,
)
from app.schemas.scenario_resolve_schema import (
    ScenarioResolvePreviewInlineRequest,
    ScenarioResolvePreviewRead,
)
from app.schemas.testcase_schema import TestCaseRead, testcase_entity_to_read
from app.services.scenario_bindings_ai_service import ScenarioBindingsAiService
from app.services.scenario_resolve_service import ScenarioResolveService
from app.services.scenario_service import ScenarioService
from app.services.service_catalog_service import ServiceCatalogService
from app.services.testcase_service import TestCaseService

router = APIRouter(prefix="/scenarios")


@router.post("", response_model=ScenarioRead, summary="Create scenario from prompt")
async def create_scenario_v1(
    payload: ScenarioCreateV1,
    service: ScenarioService = Depends(get_scenario_service),
) -> ScenarioRead:
    """Persist a new scenario with template-derived steps."""
    entity = await service.create_from_prompt_v1(
        prompt=payload.prompt,
        title=payload.title,
    )
    return scenario_entity_to_read(entity)


@router.get("", response_model=list[ScenarioListRead], summary="List scenarios")
async def list_scenarios_v1(
    service: ScenarioService = Depends(get_scenario_service),
    saved: bool | None = Query(default=None, description="Filter by saved flag"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[ScenarioListRead]:
    """Return a page of scenarios."""
    rows, _total = await service.list_scenarios_page(
        saved_only=saved,
        limit=limit,
        offset=offset,
    )
    return [
        ScenarioListRead(
            id=r.id,
            title=r.title,
            prompt=r.prompt,
            is_saved=bool(r.is_saved),
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get(
    "/{scenario_id}/test-cases",
    response_model=list[TestCaseRead],
    summary="List test cases for scenario",
)
async def list_test_cases_for_scenario(
    scenario_id: int,
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> list[TestCaseRead]:
    """Return HTTP test cases linked to the scenario."""
    rows = await testcase_service.list_for_scenario(scenario_id)
    return [testcase_entity_to_read(r) for r in rows]


class TestCaseGenerateRequest(BaseModel):
    instruction: str | None = None


@router.post(
    "/{scenario_id}/test-cases/generate",
    response_model=list[TestCaseRead],
    summary="Generate test cases from scenario steps",
)
async def generate_test_cases_for_scenario(
    scenario_id: int,
    payload: TestCaseGenerateRequest = TestCaseGenerateRequest(),
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> list[TestCaseRead]:
    """Materialize template-based API tests from stored scenario steps."""
    rows = await testcase_service.generate_all_for_scenario(
        scenario_id, instruction=payload.instruction
    )
    return [testcase_entity_to_read(r) for r in rows]


@router.post(
    "/suggest-bindings",
    response_model=ScenarioBindingsSuggestRead,
    summary="AI/heuristic suggest extract/inject between scenario services",
)
async def suggest_scenario_bindings_v1(
    payload: ScenarioBindingsSuggestRequest,
    service: ScenarioBindingsAiService = Depends(get_scenario_bindings_ai_service),
) -> ScenarioBindingsSuggestRead:
    """Propose step connections from catalog input/output fields for user review."""
    return await service.suggest(service_codes=payload.service_codes)


@router.post(
    "/resolve-preview",
    response_model=ScenarioResolvePreviewRead,
    summary="Resolve bindings for inline scenario draft",
)
async def resolve_preview_inline_v1(
    payload: ScenarioResolvePreviewInlineRequest,
    service: ScenarioResolveService = Depends(get_scenario_resolve_service),
) -> ScenarioResolvePreviewRead:
    """Dry-run inject/extract chain before a scenario is saved."""
    return await service.preview_inline(
        steps=payload.steps,
        per_step=payload.per_step,
        simulate_responses=payload.simulate_responses,
    )


@router.post(
    "/{scenario_id}/resolve-preview",
    response_model=ScenarioResolvePreviewRead,
    summary="Resolve bindings for a saved scenario",
)
async def resolve_preview_for_scenario_v1(
    scenario_id: int,
    simulate_responses: bool = Query(default=True),
    service: ScenarioResolveService = Depends(get_scenario_resolve_service),
) -> ScenarioResolvePreviewRead:
    """Return template vs resolved bodies and context trace."""
    return await service.preview_for_scenario(
        scenario_id,
        simulate_responses=simulate_responses,
    )


class ScenarioSaveDefinitionRequest(BaseModel):
    """Persist scenario metadata, steps, and pool testcase attachment in one call."""

    title: str | None = Field(default=None, max_length=255)
    prompt: str | None = Field(default=None, max_length=4000)
    steps: list[ScenarioStepRead] | None = None
    postman: PostmanCollectionConfig | None = None
    per_step: list[list[int]] | None = Field(
        default=None,
        description="Pool testcase ids per logical step; clones templates into scenario.",
    )
    mark_saved: bool = Field(default=True)


@router.post(
    "/{scenario_id}/save-definition",
    response_model=ScenarioRead,
    summary="Save scenario definition and attach pool templates",
)
async def save_scenario_definition_v1(
    scenario_id: int,
    payload: ScenarioSaveDefinitionRequest,
    scenario_service: ScenarioService = Depends(get_scenario_service),
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> ScenarioRead:
    """Patch steps/title and optionally attach pool testcases (clone, keep pool)."""
    patch = payload.model_dump(exclude_unset=True)
    steps_dump = None
    if payload.steps is not None:
        steps_dump = [s.model_dump() for s in payload.steps]
    entity = await scenario_service.patch_scenario(
        scenario_id,
        title=patch.get("title"),
        prompt=patch.get("prompt"),
        steps=steps_dump,
        postman=payload.postman.model_dump(exclude_none=True)
        if payload.postman is not None
        else None,
    )
    if payload.per_step is not None:
        await testcase_service.attach_pool_to_scenario(
            scenario_id,
            per_step=payload.per_step,
        )
    if payload.mark_saved:
        entity = await scenario_service.mark_saved(scenario_id, saved=True)
    return scenario_entity_to_read(entity)


@router.get(
    "/{scenario_id}/export/postman",
    summary="Export scenario as Postman collection",
)
async def export_scenario_postman_v1(
    scenario_id: int,
    resolved: bool = Query(default=True),
    native: bool = Query(
        default=True,
        description="When true, use {{var}} placeholders and pm.environment scripts for chaining.",
    ),
    testcase_service: TestCaseService = Depends(get_testcase_service),
    scenario_service: ScenarioService = Depends(get_scenario_service),
    catalog_service: ServiceCatalogService = Depends(get_service_catalog_service),
    cbs_repo: CbsServiceCatalogRepository = Depends(get_cbs_service_catalog_repository),
) -> JSONResponse:
    """Return Postman Collection v2.1 (resolved bodies by default)."""
    from app.services.scenario_auto_bindings_service import ScenarioAutoBindingsService

    entity = await scenario_service.get_scenario(scenario_id)
    codes = TestCaseService._ordered_service_codes_from_steps(entity.steps_json)
    steps_json = entity.steps_json
    if codes:
        auto_svc = ScenarioAutoBindingsService(
            catalog_service=catalog_service,
            cbs_repo=cbs_repo,
        )
        steps_json = await auto_svc.ensure_steps_json_bindings(
            steps_json,
            codes,
            min_existing_rows=1,
        )
    collection = await testcase_service.build_postman_for_scenario(
        scenario_id,
        resolved=resolved,
        native=native,
        steps_json_override=steps_json,
    )
    return JSONResponse(content=collection)


@router.post(
    "/{scenario_id}/attach-test-cases",
    response_model=list[TestCaseRead],
    summary="Attach pool test cases to scenario steps",
)
async def attach_test_cases_to_scenario(
    scenario_id: int,
    payload: ScenarioAttachTestCasesRequest,
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> list[TestCaseRead]:
    """Assign existing testcase rows to this scenario (per-step groups, global order)."""
    rows = await testcase_service.attach_pool_to_scenario(
        scenario_id,
        per_step=payload.per_step,
    )
    return [testcase_entity_to_read(r) for r in rows]


@router.get("/{scenario_id}", response_model=ScenarioRead, summary="Get scenario")
async def get_scenario_v1(
    scenario_id: int,
    service: ScenarioService = Depends(get_scenario_service),
) -> ScenarioRead:
    """Return one scenario with steps."""
    entity = await service.get_scenario(scenario_id)
    return scenario_entity_to_read(entity)


@router.patch("/{scenario_id}", response_model=ScenarioRead, summary="Update scenario")
async def patch_scenario_v1(
    scenario_id: int,
    payload: ScenarioPatchV1,
    service: ScenarioService = Depends(get_scenario_service),
) -> ScenarioRead:
    """Patch title, prompt, and/or steps."""
    patch = payload.model_dump(exclude_unset=True)
    steps_dump = None
    if "steps" in patch and payload.steps is not None:
        steps_dump = [s.model_dump() for s in payload.steps]
    entity = await service.patch_scenario(
        scenario_id,
        title=patch.get("title"),
        prompt=patch.get("prompt"),
        steps=steps_dump,
    )
    return scenario_entity_to_read(entity)


@router.post("/{scenario_id}/save", response_model=ScenarioRead, summary="Mark scenario saved")
async def save_scenario_v1(
    scenario_id: int,
    service: ScenarioService = Depends(get_scenario_service),
) -> ScenarioRead:
    """Bookmark scenario for the saved list."""
    entity = await service.mark_saved(scenario_id, saved=True)
    return scenario_entity_to_read(entity)


@router.delete("/{scenario_id}/save", response_model=ScenarioRead, summary="Unsave scenario")
async def unsave_scenario_v1(
    scenario_id: int,
    service: ScenarioService = Depends(get_scenario_service),
) -> ScenarioRead:
    """Remove saved bookmark."""
    entity = await service.mark_saved(scenario_id, saved=False)
    return scenario_entity_to_read(entity)

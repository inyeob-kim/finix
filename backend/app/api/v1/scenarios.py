"""HTTP routes for scenarios (v1)."""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.deps import (
    get_collection_var_generator_service,
    get_scenario_bindings_ai_service,
    get_scenario_resolve_service,
    get_scenario_service,
    get_testcase_service,
    require_active_inst_cd,
)
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
from app.schemas.testcase_schema import TestCaseRead, TestCaseRefV1, testcase_entity_to_read
from app.services.scenario_bindings_ai_service import ScenarioBindingsAiService
from app.services.scenario_resolve_service import ScenarioResolveService
from app.services.scenario_service import ScenarioService
from app.services.collection_var_generator_service import CollectionVarGeneratorService
from app.services.testcase_service import TestCaseService

router = APIRouter(prefix="/scenarios")


@router.post("", response_model=ScenarioRead, summary="Create scenario from prompt")
async def create_scenario_v1(
    payload: ScenarioCreateV1,
    service: ScenarioService = Depends(get_scenario_service),
    inst_cd: str = Depends(require_active_inst_cd),
) -> ScenarioRead:
    """Persist a new scenario with template-derived steps."""
    entity = await service.create_from_prompt_v1(
        prompt=payload.prompt,
        title=payload.title,
        inst_cd=inst_cd,
    )
    return scenario_entity_to_read(entity)


@router.get("", response_model=list[ScenarioListRead], summary="List scenarios")
async def list_scenarios_v1(
    service: ScenarioService = Depends(get_scenario_service),
    inst_cd: str = Depends(require_active_inst_cd),
    saved: bool | None = Query(default=None, description="Filter by saved flag"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[ScenarioListRead]:
    """Return a page of scenarios."""
    rows, _total = await service.list_scenarios_page(
        saved_only=saved,
        limit=limit,
        offset=offset,
        inst_cd=inst_cd,
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


class ScenarioShellCreateV1(BaseModel):
    """Create an empty scenario row for registry sync (no LLM)."""

    title: str = Field(..., min_length=1, max_length=255)
    prompt: str | None = Field(default=None, max_length=4000)
    is_saved: bool = Field(default=False)


@router.post(
    "/shell",
    response_model=ScenarioRead,
    summary="Create blank scenario shell for registry persist",
)
async def create_scenario_shell_v1(
    payload: ScenarioShellCreateV1,
    service: ScenarioService = Depends(get_scenario_service),
    inst_cd: str = Depends(require_active_inst_cd),
) -> ScenarioRead:
    """Persist a new empty scenario without AI generation."""
    entity = await service.create_blank(
        title=payload.title,
        prompt=payload.prompt,
        is_saved=payload.is_saved,
        inst_cd=inst_cd,
    )
    return scenario_entity_to_read(entity)


@router.get(
    "/{scenario_id}/test-cases",
    response_model=list[TestCaseRead],
    summary="List test cases for scenario",
)
async def list_test_cases_for_scenario(
    scenario_id: int,
    inst_cd: str = Depends(require_active_inst_cd),
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> list[TestCaseRead]:
    """Return HTTP test cases linked to the scenario."""
    rows = await testcase_service.list_for_scenario(scenario_id, inst_cd=inst_cd)
    return await testcase_service.to_reads(rows)


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
    inst_cd: str = Depends(require_active_inst_cd),
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> list[TestCaseRead]:
    """Materialize template-based API tests from stored scenario steps."""
    rows = await testcase_service.generate_all_for_scenario(
        scenario_id, instruction=payload.instruction, inst_cd=inst_cd
    )
    return await testcase_service.to_reads(rows)


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
        inst_cd=payload.inst_cd,
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
    inst_cd: str = Depends(require_active_inst_cd),
    service: ScenarioResolveService = Depends(get_scenario_resolve_service),
) -> ScenarioResolvePreviewRead:
    """Return template vs resolved bodies and context trace."""
    return await service.preview_for_scenario(
        scenario_id,
        inst_cd=inst_cd,
        simulate_responses=simulate_responses,
    )


class ScenarioSaveDefinitionRequest(BaseModel):
    """Persist scenario metadata, steps, and pool testcase attachment in one call."""

    title: str | None = Field(default=None, max_length=255)
    prompt: str | None = Field(default=None, max_length=4000)
    steps: list[ScenarioStepRead] | None = None
    postman: PostmanCollectionConfig | None = None
    per_step: list[list[TestCaseRefV1]] | None = Field(
        default=None,
        description="Natural-key testcase refs per logical step; links pool rows to scenario.",
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
    inst_cd: str = Depends(require_active_inst_cd),
    scenario_service: ScenarioService = Depends(get_scenario_service),
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> ScenarioRead:
    """Patch steps/title and optionally link pool testcases (natural-key refs)."""
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
            inst_cd=inst_cd,
        )
    entity = await scenario_service.mark_saved(
        scenario_id,
        saved=payload.mark_saved,
    )
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
    inst_cd: str = Depends(require_active_inst_cd),
    testcase_service: TestCaseService = Depends(get_testcase_service),
    generator_service: CollectionVarGeneratorService = Depends(
        get_collection_var_generator_service,
    ),
) -> JSONResponse:
    """Return Postman Collection v2.1 using persisted steps/bindings (no auto-bind)."""
    catalog = await generator_service.build_catalog_map()
    collection = await testcase_service.build_postman_for_scenario(
        scenario_id,
        inst_cd=inst_cd,
        resolved=resolved,
        native=native,
        generator_catalog=catalog,
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
    inst_cd: str = Depends(require_active_inst_cd),
    testcase_service: TestCaseService = Depends(get_testcase_service),
) -> list[TestCaseRead]:
    """Assign existing testcase rows to this scenario (per-step groups, global order)."""
    rows = await testcase_service.attach_pool_to_scenario(
        scenario_id,
        per_step=payload.per_step,
        inst_cd=inst_cd,
    )
    return await testcase_service.to_reads(rows)


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

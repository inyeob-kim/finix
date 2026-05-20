"""HTTP routes for scenarios (v1)."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.deps import get_scenario_service, get_testcase_service
from app.schemas.scenario_schema import (
    ScenarioAttachTestCasesRequest,
    ScenarioCreateV1,
    ScenarioListRead,
    ScenarioPatchV1,
    ScenarioRead,
    scenario_entity_to_read,
)
from app.schemas.testcase_schema import TestCaseRead, testcase_entity_to_read
from app.services.scenario_service import ScenarioService
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

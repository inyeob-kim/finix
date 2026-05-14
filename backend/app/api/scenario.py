"""HTTP routes for scenario operations."""

from fastapi import APIRouter, Depends

from app.core.deps import get_scenario_service
from app.schemas.scenario_schema import (
    ScenarioGenerateRequest,
    ScenarioResponse,
    scenario_entity_to_legacy_response,
)
from app.services.scenario_service import ScenarioService

router = APIRouter()


@router.post(
    "/generate",
    response_model=ScenarioResponse,
    summary="Generate and persist a scenario",
)
async def generate_scenario(
    payload: ScenarioGenerateRequest,
    service: ScenarioService = Depends(get_scenario_service),
) -> ScenarioResponse:
    """
    Accept a generation request and return the persisted scenario.

    Args:
        payload: Validated request body.
        service: Injected scenario service.

    Returns:
        API response model mapped from the stored entity.
    """
    entity = await service.generate_scenario(
        title=payload.title,
        prompt=payload.prompt,
    )
    return scenario_entity_to_legacy_response(entity)

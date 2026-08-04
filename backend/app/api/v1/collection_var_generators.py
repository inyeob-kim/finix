"""Collection variable generator catalog API."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.deps import get_collection_var_generator_service
from app.schemas.collection_var_generator_schema import (
    CollectionVarGeneratorCreateRequest,
    CollectionVarGeneratorDraftRead,
    CollectionVarGeneratorDraftRequest,
    CollectionVarGeneratorListRead,
    CollectionVarGeneratorPreviewRead,
    CollectionVarGeneratorPreviewRequest,
    CollectionVarGeneratorRead,
    CollectionVarGeneratorUpdateRequest,
)
from app.services.collection_var_generator_service import CollectionVarGeneratorService

router = APIRouter(prefix="/collection-var-generators")


@router.get(
    "",
    response_model=CollectionVarGeneratorListRead,
    summary="List builtin + shared generators",
)
async def list_generators(
    service: CollectionVarGeneratorService = Depends(get_collection_var_generator_service),
) -> CollectionVarGeneratorListRead:
    return await service.list_for_ui()


@router.post(
    "/ai-draft",
    response_model=CollectionVarGeneratorDraftRead,
    summary="Draft a generator from natural language",
)
async def draft_generator(
    body: CollectionVarGeneratorDraftRequest,
    service: CollectionVarGeneratorService = Depends(get_collection_var_generator_service),
) -> CollectionVarGeneratorDraftRead:
    return await service.draft_from_prompt(body.prompt)


@router.post(
    "/preview",
    response_model=CollectionVarGeneratorPreviewRead,
    summary="Preview generator output once",
)
async def preview_generator(
    body: CollectionVarGeneratorPreviewRequest,
    service: CollectionVarGeneratorService = Depends(get_collection_var_generator_service),
) -> CollectionVarGeneratorPreviewRead:
    return await service.preview(
        key=body.key,
        impl_kind=body.impl_kind,
        impl=body.impl,
    )


@router.post(
    "",
    response_model=CollectionVarGeneratorRead,
    summary="Save shared generator",
)
async def create_generator(
    body: CollectionVarGeneratorCreateRequest,
    service: CollectionVarGeneratorService = Depends(get_collection_var_generator_service),
) -> CollectionVarGeneratorRead:
    return await service.create(body)


@router.patch(
    "/{key}",
    response_model=CollectionVarGeneratorRead,
    summary="Update shared generator impl",
)
async def update_generator(
    key: str,
    body: CollectionVarGeneratorUpdateRequest,
    service: CollectionVarGeneratorService = Depends(get_collection_var_generator_service),
) -> CollectionVarGeneratorRead:
    return await service.update(key, body)


@router.delete(
    "/{key}",
    status_code=204,
    summary="Deactivate shared generator",
)
async def delete_generator(
    key: str,
    service: CollectionVarGeneratorService = Depends(get_collection_var_generator_service),
) -> None:
    await service.delete(key)

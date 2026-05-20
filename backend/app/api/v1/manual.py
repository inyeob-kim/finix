"""Manual RAG chat endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.deps import get_manual_rag_service
from app.schemas.manual_schema import (
    ManualChatRequest,
    ManualChatResponse,
    ManualSourceSnippet,
    ManualStatusResponse,
)
from app.services.manual_rag_service import ManualRagService

router = APIRouter(prefix="/manual")


@router.get("/status", response_model=ManualStatusResponse, summary="Manual index status")
async def manual_status(
    service: ManualRagService = Depends(get_manual_rag_service),
) -> ManualStatusResponse:
    data = await service.status()
    return ManualStatusResponse(**data)


@router.post("/reindex", response_model=ManualStatusResponse, summary="Reindex manual")
async def manual_reindex(
    service: ManualRagService = Depends(get_manual_rag_service),
) -> ManualStatusResponse:
    data = await service.ensure_indexed(force=True)
    return ManualStatusResponse(
        indexed=data["indexed"],
        chunk_count=data["chunk_count"],
        source_checksum=data.get("source_checksum"),
        source_path=data["source_path"],
        reindexed=data.get("reindexed"),
    )


@router.post("/chat", response_model=ManualChatResponse, summary="Ask manual (RAG)")
async def manual_chat(
    payload: ManualChatRequest,
    service: ManualRagService = Depends(get_manual_rag_service),
) -> ManualChatResponse:
    data = await service.chat(
        message=payload.message,
        history=[t.model_dump() for t in payload.history],
    )
    return ManualChatResponse(
        answer=data["answer"],
        sources=[ManualSourceSnippet(**s) for s in data["sources"]],
    )

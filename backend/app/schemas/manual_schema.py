"""Schemas for manual RAG chat API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ManualChatTurn(BaseModel):
    role: str = Field(description="user or assistant")
    content: str


class ManualChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[ManualChatTurn] = Field(default_factory=list)


class ManualSourceSnippet(BaseModel):
    header_path: str
    chunk_index: int
    preview: str


class ManualChatResponse(BaseModel):
    answer: str
    sources: list[ManualSourceSnippet]


class ManualStatusResponse(BaseModel):
    indexed: bool
    chunk_count: int
    source_checksum: str | None = None
    source_path: str
    reindexed: bool | None = None

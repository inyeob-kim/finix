"""Pydantic schemas for institutions and mock auth."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class InstitutionRead(BaseModel):
    inst_cd: str
    inst_nm: str
    is_active: bool
    remark: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class InstitutionListResponse(BaseModel):
    items: list[InstitutionRead]
    total: int


class InstitutionCreateRequest(BaseModel):
    inst_cd: str = Field(..., min_length=1, max_length=16)
    inst_nm: str = Field(..., min_length=1, max_length=128)
    is_active: bool = True
    remark: str | None = Field(default=None, max_length=512)


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=128)
    role: Literal["qa.editor", "qa.approver"]
    inst_cd: str = Field(..., min_length=1, max_length=16)
    password: str | None = Field(
        default=None,
        description="Ignored in mock auth (UI-only).",
    )


class LoginResponse(BaseModel):
    username: str
    role: str
    inst_cd: str
    inst_nm: str

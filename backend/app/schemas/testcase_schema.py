"""Pydantic schemas for test case API contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.fnx_testcase import FnxTestcase
from app.utils.json_text import loads_json


class TestCaseRead(BaseModel):
    """HTTP-oriented test case returned to clients (natural-key identity)."""

    inst_cd: str
    svc_code: str
    rule_case_id: str
    name: str
    case_id: str | None = None
    method: str | None
    endpoint: str | None
    request_body: dict[str, Any]
    expected_status: int | None
    expected_body: dict[str, Any]
    created_at: datetime


class TestCaseRefV1(BaseModel):
    """Natural-key reference to a pool test case."""

    svc_code: str = Field(..., min_length=1, max_length=64)
    rule_case_id: str = Field(..., min_length=1, max_length=64)


class TestCasePatchV1(BaseModel):
    """Partial update for a materialized test case."""

    name: str | None = Field(default=None, max_length=255)
    method: str | None = Field(default=None, max_length=16)
    endpoint: str | None = Field(default=None, max_length=512)
    request_body: dict[str, Any] | None = None
    expected_status: int | None = None
    expected_body: dict[str, Any] | None = None


def testcase_entity_to_read(entity: FnxTestcase) -> TestCaseRead:
    """Map ORM fnx_testcase to API read model."""
    return TestCaseRead(
        inst_cd=entity.inst_cd,
        svc_code=entity.svc_code,
        rule_case_id=entity.rule_case_id,
        name=entity.name,
        case_id=entity.rule_case_id,
        method=entity.http_method,
        endpoint=entity.endpoint,
        request_body=loads_json(entity.request_body_json, {}),
        expected_status=entity.expected_status,
        expected_body=loads_json(entity.expected_body_json, {}),
        created_at=entity.created_at,
    )

"""Pydantic schemas for test case API contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.testcase import TestCase
from app.utils.json_text import loads_json


class TestCaseRead(BaseModel):
    """HTTP-oriented test case returned to clients."""

    id: int
    scenario_id: int | None
    name: str
    method: str | None
    endpoint: str | None
    request_body: dict[str, Any]
    expected_status: int | None
    expected_body: dict[str, Any]
    step_index: int | None
    created_at: datetime


class TestCasePatchV1(BaseModel):
    """Partial update for a generated test case."""

    name: str | None = Field(default=None, max_length=255)
    method: str | None = Field(default=None, max_length=16)
    endpoint: str | None = Field(default=None, max_length=512)
    request_body: dict[str, Any] | None = None
    expected_status: int | None = None
    expected_body: dict[str, Any] | None = None
    step_index: int | None = None


def testcase_entity_to_read(entity: TestCase) -> TestCaseRead:
    """Map ORM test case to API read model."""
    return TestCaseRead(
        id=entity.id,
        scenario_id=entity.scenario_id,
        name=entity.name,
        method=entity.http_method,
        endpoint=entity.endpoint,
        request_body=loads_json(entity.request_body_json, {}),
        expected_status=entity.expected_status,
        expected_body=loads_json(entity.expected_body_json, {}),
        step_index=entity.step_index,
        created_at=entity.created_at,
    )

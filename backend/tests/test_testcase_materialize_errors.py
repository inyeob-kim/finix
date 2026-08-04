"""Tests for test-case pool materialize error messages."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

from app.services.testcase_service import TestCaseService


class _FakeRulesRepo:
    def __init__(self, *, active=None, current=None, versions=None):
        self._active = active
        self._current = current
        self._versions = versions or []

    async def get_active_bundle(self, service_code: str):
        return self._active

    async def get_current(self, service_code: str):
        return self._current

    async def list_versions(self, service_code: str):
        return self._versions


def test_materialize_message_draft_only_needs_apply():
    draft_only = SimpleNamespace(
        id=4,
        has_draft=True,
        has_applied=False,
        rules_json=None,
    )
    hist = SimpleNamespace(
        id=9,
        rules_json=json.dumps({"rules": [{"rule_id": "PY027-E-001"}]}),
    )
    svc = TestCaseService(
        metadata_repo=None,  # type: ignore[arg-type]
        registry_repo=None,  # type: ignore[arg-type]
        cbs_catalog_repo=None,  # type: ignore[arg-type]
        service_rules_repo=_FakeRulesRepo(
            active=None, current=draft_only, versions=[hist]
        ),
    )
    msg = asyncio.run(svc._materialize_failure_message("PY027"))
    assert "작업본만 있고 적용된 규칙이 없습니다" in msg
    assert "적용" in msg

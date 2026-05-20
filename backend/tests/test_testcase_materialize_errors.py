"""Tests for test-case pool materialize error messages."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

from app.services.testcase_service import TestCaseService


class _FakeRulesRepo:
    def __init__(self, *, active=None, versions=None):
        self._active = active
        self._versions = versions or []

    async def get_active_bundle(self, service_code: str):
        return self._active

    async def list_versions(self, service_code: str):
        return self._versions


def test_materialize_message_yaml_exists_not_active():
    draft = SimpleNamespace(
        id=4,
        version=1,
        status="draft",
        rules_json=json.dumps({"rules": [{"rule_id": "PY027-E-001"}]}),
    )
    svc = TestCaseService(
        metadata_repo=None,  # type: ignore[arg-type]
        registry_repo=None,  # type: ignore[arg-type]
        cbs_catalog_repo=None,  # type: ignore[arg-type]
        service_rules_repo=_FakeRulesRepo(active=None, versions=[draft]),
    )
    msg = asyncio.run(svc._materialize_failure_message("PY027"))
    assert "YAML 규칙은 등록되어 있으나 Active 상태가 아닙니다" in msg
    assert "draft" in msg
    assert "#4" in msg

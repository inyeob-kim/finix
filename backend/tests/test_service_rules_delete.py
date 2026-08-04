"""Delete history snapshot behavior."""

from __future__ import annotations

import asyncio

import pytest

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.models.service_rule_history import ServiceRuleHistory
from app.services.service_rules_service import ServiceRulesService


class _FakeRepo:
    def __init__(self) -> None:
        self.deleted: list[int] = []
        self._row = ServiceRuleHistory(
            id=10,
            service_code="PY000",
            service_name_snapshot="svc",
            source_version="test",
            yaml_text="x",
            rules_json="{}",
            checksum="abc",
            change_kind="migrate",
        )

    async def get_history(self, history_id: int) -> ServiceRuleHistory | None:
        if history_id == 10:
            return self._row
        return None

    async def delete_history(self, history_id: int) -> bool:
        self.deleted.append(history_id)
        return history_id == 10


def test_delete_bundle_success():
    repo = _FakeRepo()
    svc = ServiceRulesService(repo=repo)
    asyncio.run(svc.delete_bundle(service_code="PY000", bundle_id=10))
    assert repo.deleted == [10]


def test_delete_bundle_rejects_service_code_mismatch():
    repo = _FakeRepo()
    svc = ServiceRulesService(repo=repo)
    with pytest.raises(InvalidInputError):
        asyncio.run(svc.delete_bundle(service_code="OTHER", bundle_id=10))


def test_delete_bundle_not_found():
    repo = _FakeRepo()
    svc = ServiceRulesService(repo=repo)
    with pytest.raises(EntityNotFoundError):
        asyncio.run(svc.delete_bundle(service_code="PY000", bundle_id=99))

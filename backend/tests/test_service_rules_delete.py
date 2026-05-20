import asyncio

import pytest

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.models.service_rule_bundle import ServiceRuleBundle
from app.services.service_rules_service import ServiceRulesService


class _FakeRepo:
    def __init__(self) -> None:
        self.deleted: list[int] = []

    async def get_bundle(self, bundle_id: int) -> ServiceRuleBundle | None:
        if bundle_id == 10:
            return ServiceRuleBundle(
                id=10,
                service_code="PY000",
                service_name_snapshot="svc",
                status="draft",
                version=1,
                source_version="test",
                yaml_text="x",
                rules_json="{}",
                checksum="abc",
            )
        return None

    async def delete_bundle(self, bundle_id: int) -> bool:
        self.deleted.append(bundle_id)
        return bundle_id == 10


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

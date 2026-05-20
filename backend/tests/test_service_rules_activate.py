"""Activate promotes one bundle and demotes the previous active row."""

from __future__ import annotations

import asyncio

import pytest

from app.models.service_rule_bundle import ServiceRuleBundle
from app.models.service_rule_pointer import ServiceRulePointer
from app.services.service_rules_service import ServiceRulesService


def _bundle(
    *,
    id: int,
    code: str = "PY027",
    version: int,
    status: str,
) -> ServiceRuleBundle:
    return ServiceRuleBundle(
        id=id,
        service_code=code,
        service_name_snapshot="svc",
        status=status,
        version=version,
        source_version="src",
        yaml_text="x",
        rules_json="{}",
        checksum="abc",
    )


class _FakeRepo:
    def __init__(self) -> None:
        self.bundles: dict[int, ServiceRuleBundle] = {
            1: _bundle(id=1, version=1, status="active"),
            2: _bundle(id=2, version=2, status="approved"),
        }
        self.pointer = ServiceRulePointer(
            service_code="PY027",
            active_bundle_id=1,
            approved_bundle_id=None,
        )
        self.active_id: int | None = 1

    async def get_bundle(self, bundle_id: int) -> ServiceRuleBundle | None:
        return self.bundles.get(bundle_id)

    async def get_pointer(self, service_code: str) -> ServiceRulePointer | None:
        if service_code == "PY027":
            return self.pointer
        return None

    async def flush_bundle(self, bundle: ServiceRuleBundle) -> ServiceRuleBundle:
        self.bundles[bundle.id] = bundle
        return bundle

    async def set_active(self, service_code: str, bundle_id: int | None) -> ServiceRulePointer:
        self.active_id = bundle_id
        self.pointer.active_bundle_id = bundle_id
        return self.pointer

    async def list_versions(self, service_code: str) -> list[ServiceRuleBundle]:
        if service_code != "PY027":
            return []
        return sorted(self.bundles.values(), key=lambda b: b.version, reverse=True)


def test_activate_demotes_previous_active_bundle():
    repo = _FakeRepo()
    svc = ServiceRulesService(repo=repo)
    result = asyncio.run(svc.activate(2))
    assert result.id == 2
    assert result.status == "active"
    assert repo.bundles[1].status == "superseded"
    assert repo.active_id == 2


def test_activate_same_bundle_is_idempotent():
    repo = _FakeRepo()
    svc = ServiceRulesService(repo=repo)
    result = asyncio.run(svc.activate(1))
    assert result.status == "active"
    assert repo.bundles[1].status == "active"
    assert repo.active_id == 1


def test_reconcile_active_statuses():
    repo = _FakeRepo()
    repo.bundles[3] = _bundle(id=3, version=3, status="active")
    svc = ServiceRulesService(repo=repo)
    changed = asyncio.run(svc.reconcile_active_statuses_for_service("PY027"))
    assert changed >= 1
    assert repo.bundles[1].status == "active"
    assert repo.bundles[3].status == "superseded"

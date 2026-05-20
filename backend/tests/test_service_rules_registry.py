"""Registry aggregation and draft update behavior."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from app.core.exceptions import InvalidInputError
from app.models.service_rule_bundle import ServiceRuleBundle
from app.models.service_rule_pointer import ServiceRulePointer
from app.services.service_rules_service import (
    ServiceRulesService,
    _aggregate_registry_rows,
)
from tests.test_service_rules_validation import _case_rule

_VALID_DRAFT_YAML = f"""
service_code: PY027
service_name: Withdraw
rules:
{_case_rule("PY027-E-001", "E")}
{_case_rule("PY027-N-001", "N", tags='["business"]')}
"""


def _bundle(
    *,
    id: int,
    code: str = "PY027",
    version: int,
    status: str,
    name: str = "출금",
) -> ServiceRuleBundle:
    return ServiceRuleBundle(
        id=id,
        service_code=code,
        service_name_snapshot=name,
        status=status,
        version=version,
        source_version="src-1",
        yaml_text="service_code: PY027\nrules: []\n",
        rules_json='{"rules": [{"case_id": "x"}]}',
        checksum="abc",
        created_by="tester",
        updated_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
    )


def test_aggregate_one_row_per_service_prefers_latest_draft():
    bundles = [
        _bundle(id=1, version=1, status="active"),
        _bundle(id=2, version=2, status="draft"),
        _bundle(id=3, version=3, status="draft"),
    ]
    ptr = ServiceRulePointer(service_code="PY027", active_bundle_id=1, approved_bundle_id=None)
    rows = _aggregate_registry_rows(bundles, {"PY027": ptr})
    assert len(rows) == 1
    row = rows[0]
    assert row.bundle_id == 3
    assert row.bundle_version == 3
    assert row.draft_bundle_version == 3
    assert row.active_bundle_version == 1
    assert row.version_count == 3
    assert row.status == "draft"


def test_aggregate_active_only_when_no_draft():
    bundles = [_bundle(id=1, version=2, status="active")]
    ptr = ServiceRulePointer(service_code="PY027", active_bundle_id=1, approved_bundle_id=None)
    rows = _aggregate_registry_rows(bundles, {"PY027": ptr})
    assert rows[0].bundle_id == 1
    assert rows[0].status == "active"
    assert rows[0].draft_bundle_version is None
    assert rows[0].active_bundle_version == 2


class _FakeRepo:
    def __init__(self, bundle: ServiceRuleBundle | None) -> None:
        self._bundle = bundle
        self.flushed: list[int] = []

    async def get_bundle(self, bundle_id: int) -> ServiceRuleBundle | None:
        if self._bundle and self._bundle.id == bundle_id:
            return self._bundle
        return None

    async def flush_bundle(self, bundle: ServiceRuleBundle) -> ServiceRuleBundle:
        self.flushed.append(bundle.id)
        return bundle


def test_update_draft_rejects_non_draft():
    bundle = _bundle(id=5, version=2, status="active")
    svc = ServiceRulesService(repo=_FakeRepo(bundle))
    with pytest.raises(InvalidInputError, match="draft"):
        asyncio.run(
            svc.update_draft(
                service_code="PY027",
                bundle_id=5,
                yaml_text=_VALID_DRAFT_YAML,
            )
        )


def test_update_draft_keeps_version():
    bundle = _bundle(id=5, version=4, status="draft")
    repo = _FakeRepo(bundle)
    svc = ServiceRulesService(repo=repo)
    updated = asyncio.run(
        svc.update_draft(
            service_code="PY027",
            bundle_id=5,
            yaml_text=_VALID_DRAFT_YAML,
        )
    )
    assert updated.version == 4
    assert repo.flushed == [5]

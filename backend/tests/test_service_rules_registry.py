"""Registry aggregation and draft upsert behavior."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from app.models.service_rule_current import ServiceRuleCurrent
from app.services.service_rules_service import ServiceRulesService
from tests.test_service_rules_validation import _case_rule

_VALID_DRAFT_YAML = f"""
service_code: PY027
service_name: Withdraw
rules:
{_case_rule("PY027-E-001", "E")}
{_case_rule("PY027-N-001", "N", tags='["business"]')}
"""


def _current(
    *,
    id: int = 1,
    code: str = "PY027",
    applied: bool = True,
    draft: bool = False,
) -> ServiceRuleCurrent:
    row = ServiceRuleCurrent(
        id=id,
        service_code=code,
        service_name_snapshot="출금",
        source_version="src-1",
        yaml_text="service_code: PY027\nrules: []\n" if applied else "",
        rules_json='{"rules": [{"case_id": "x"}]}' if applied else None,
        checksum="applied-cs" if applied else "",
        updated_by="tester",
        updated_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
    )
    if draft:
        row.draft_yaml_text = "draft yaml"
        row.draft_rules_json = '{"rules": [{"case_id": "d"}]}'
        row.draft_checksum = "draft-cs"
        row.draft_source_version = "src-draft"
        row.draft_updated_by = "editor"
        row.draft_updated_at = datetime(2026, 5, 2, tzinfo=timezone.utc)
    return row


class _FakeRepo:
    def __init__(self, rows: list[ServiceRuleCurrent]) -> None:
        self.rows = {r.service_code: r for r in rows}
        self.history_counts: dict[str, int] = {}

    async def list_all_current(
        self, *, limit: int = 5000, offset: int = 0
    ) -> list[ServiceRuleCurrent]:
        items = list(self.rows.values())
        return items[offset : offset + limit]

    async def count_history(self, service_code: str) -> int:
        return self.history_counts.get(service_code, 0)

    async def get_current(self, service_code: str) -> ServiceRuleCurrent | None:
        return self.rows.get(service_code)

    async def get_current_by_id(self, current_id: int) -> ServiceRuleCurrent | None:
        for r in self.rows.values():
            if r.id == current_id:
                return r
        return None

    async def ensure_current(self, service_code: str) -> ServiceRuleCurrent:
        row = self.rows.get(service_code)
        if row is not None:
            return row
        row = _current(code=service_code, applied=False)
        self.rows[service_code] = row
        return row

    async def flush_current(self, row: ServiceRuleCurrent) -> ServiceRuleCurrent:
        self.rows[row.service_code] = row
        return row


def test_list_registry_prefers_draft_status():
    repo = _FakeRepo([_current(applied=True, draft=True)])
    repo.history_counts["PY027"] = 2
    svc = ServiceRulesService(repo=repo)
    rows, total = asyncio.run(svc.list_registry(limit=50, offset=0))
    assert total == 1
    assert rows[0].has_draft is True
    assert rows[0].status == "draft"
    assert rows[0].history_count == 2
    assert rows[0].active_bundle_version == 1
    assert rows[0].business_domain == "PAYMENT"
    assert rows[0].component_code == ""


def test_list_registry_active_when_no_draft():
    repo = _FakeRepo([_current(applied=True, draft=False)])
    svc = ServiceRulesService(repo=repo)
    rows, _ = asyncio.run(svc.list_registry(limit=50, offset=0))
    assert rows[0].status == "active"
    assert rows[0].has_draft is False
    assert rows[0].is_active is True


def test_list_registry_uses_catalog_taxonomy():
    class _Catalog:
        async def taxonomy_by_service_code(self):
            return {"PY027": ("PAYMENT", "PYS")}

    repo = _FakeRepo([_current(applied=True, draft=False)])
    svc = ServiceRulesService(repo=repo, cbs_catalog=_Catalog())
    rows, _ = asyncio.run(svc.list_registry(limit=50, offset=0))
    assert rows[0].business_domain == "PAYMENT"
    assert rows[0].component_code == "PYS"


def test_upsert_draft_on_applied_row():
    row = _current(applied=True, draft=False)
    repo = _FakeRepo([row])
    svc = ServiceRulesService(repo=repo)
    updated = asyncio.run(
        svc.update_draft(
            service_code="PY027",
            bundle_id=1,
            yaml_text=_VALID_DRAFT_YAML,
        )
    )
    assert updated.has_draft is True
    assert "PY027-E-001" in (updated.draft_yaml_text or "")

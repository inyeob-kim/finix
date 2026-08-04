"""Apply draft and restore-from-history for service rules."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.models.service_rule_current import ServiceRuleCurrent
from app.models.service_rule_history import ServiceRuleHistory
from app.services.service_rules_service import ServiceRulesService
from tests.test_service_rules_validation import _case_rule

_VALID_YAML = f"""
service_code: PY027
service_name: Withdraw
rules:
{_case_rule("PY027-E-001", "E")}
{_case_rule("PY027-N-001", "N", tags='["business"]')}
"""

_VALID_YAML_V2 = f"""
service_code: PY027
service_name: Withdraw
rules:
{_case_rule("PY027-E-001", "E")}
{_case_rule("PY027-E-002", "E")}
{_case_rule("PY027-N-001", "N", tags='["business"]')}
"""


def _current(
    *,
    id: int = 1,
    code: str = "PY027",
    yaml_text: str = "service_code: PY027\nrules: []\n",
    checksum: str = "applied-cs",
    draft_yaml: str | None = None,
    draft_checksum: str | None = None,
) -> ServiceRuleCurrent:
    row = ServiceRuleCurrent(
        id=id,
        service_code=code,
        service_name_snapshot="Withdraw",
        source_version="src",
        yaml_text=yaml_text,
        rules_json='{"rules": []}',
        checksum=checksum if yaml_text.strip() else "",
        updated_by="tester",
    )
    if draft_yaml is not None:
        row.draft_yaml_text = draft_yaml
        row.draft_rules_json = '{"rules": [{"case_id": "x"}]}'
        row.draft_checksum = draft_checksum or "draft-cs"
        row.draft_updated_by = "tester"
        row.draft_updated_at = datetime.now(timezone.utc)
    return row


class _FakeRepo:
    def __init__(self, row: ServiceRuleCurrent) -> None:
        self.row = row
        self.history: list[ServiceRuleHistory] = []
        self._hist_id = 100

    async def get_current(self, service_code: str) -> ServiceRuleCurrent | None:
        if self.row.service_code == service_code:
            return self.row
        return None

    async def get_current_by_id(self, current_id: int) -> ServiceRuleCurrent | None:
        if self.row.id == current_id:
            return self.row
        return None

    async def ensure_current(self, service_code: str) -> ServiceRuleCurrent:
        if self.row.service_code == service_code:
            return self.row
        self.row = _current(code=service_code, yaml_text="", checksum="")
        return self.row

    async def flush_current(self, row: ServiceRuleCurrent) -> ServiceRuleCurrent:
        self.row = row
        return row

    async def add_history(self, hist: ServiceRuleHistory) -> ServiceRuleHistory:
        self._hist_id += 1
        hist.id = self._hist_id
        self.history.append(hist)
        return hist

    async def get_history(self, history_id: int) -> ServiceRuleHistory | None:
        for h in self.history:
            if h.id == history_id:
                return h
        return None

    async def list_history(self, service_code: str) -> list[ServiceRuleHistory]:
        return [h for h in self.history if h.service_code == service_code]


def test_apply_draft_snapshots_previous_and_clears_draft():
    row = _current(
        yaml_text="old applied",
        checksum="old-cs",
        draft_yaml=_VALID_YAML,
        draft_checksum="new-cs",
    )
    repo = _FakeRepo(row)
    svc = ServiceRulesService(repo=repo)
    result = asyncio.run(svc.apply_draft(service_code="PY027", applied_by="me"))
    assert result.has_draft is False
    assert result.has_applied is True
    assert "PY027-E-001" in (result.yaml_text or "")
    assert len(repo.history) == 1
    assert repo.history[0].change_kind == "apply"
    assert repo.history[0].checksum == "old-cs"


def test_activate_compat_applies_draft():
    row = _current(draft_yaml=_VALID_YAML, draft_checksum="d1")
    row.yaml_text = ""
    row.checksum = ""
    repo = _FakeRepo(row)
    svc = ServiceRulesService(repo=repo)
    result = asyncio.run(svc.activate(1))
    assert result.has_applied is True
    assert result.has_draft is False


def test_restore_from_history_snapshots_current():
    row = _current(yaml_text=_VALID_YAML, checksum="cur-cs")
    repo = _FakeRepo(row)
    hist = ServiceRuleHistory(
        id=50,
        service_code="PY027",
        service_name_snapshot="Withdraw",
        source_version="old",
        yaml_text=_VALID_YAML_V2,
        rules_json='{"rules": []}',
        checksum="hist-cs",
        change_kind="migrate",
        created_by="mig",
    )
    repo.history.append(hist)
    svc = ServiceRulesService(repo=repo)
    result = asyncio.run(
        svc.restore_from_history(service_code="PY027", history_id=50)
    )
    assert result.checksum == "hist-cs"
    assert "PY027-E-002" in (result.yaml_text or "")
    assert any(h.change_kind == "restore" for h in repo.history)


def test_apply_without_draft_fails():
    row = _current()
    svc = ServiceRulesService(repo=_FakeRepo(row))
    with pytest.raises(InvalidInputError, match="작업본"):
        asyncio.run(svc.apply_draft(service_code="PY027"))


def test_restore_missing_history():
    row = _current()
    svc = ServiceRulesService(repo=_FakeRepo(row))
    with pytest.raises(EntityNotFoundError):
        asyncio.run(
            svc.restore_from_history(service_code="PY027", history_id=999)
        )

"""Scenario attachment requires 확정(활성) rule cases; editor run does not."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.core.exceptions import InvalidInputError
from app.domain.inst_scope import DEFAULT_INST_CD
from app.services.testcase_service import TestCaseService
from tests.test_testcase_materialize_one_case import _FakeCbs, _FakeRegistry, _FakeTcRepo


class _FakeCaseRepo:
    def __init__(self, *, applied: bool) -> None:
        self._applied = applied

    async def get_case_by_case_id(self, svc_code: str, case_id: str, *, inst_cd: str):
        return SimpleNamespace(
            inst_cd=inst_cd,
            svc_code=svc_code,
            rule_case_id=case_id,
            checksum="applied-checksum" if self._applied else "",
            rule_type="N",
            title="t",
            description="d",
            input_json='{"a":1}',
            expect_json='{"outcome":"success","http_status":200}',
            assertions_json="[]",
            tags_json="[]",
            evidence_json="{}",
            folder=None,
            extra_json=None,
        )

    @staticmethod
    def is_case_applied(row) -> bool:
        return bool((getattr(row, "checksum", None) or "").strip())

    async def list_applied_cases(self, svc_code: str, *, inst_cd: str):
        row = await self.get_case_by_case_id(svc_code, "PY016-N-001", inst_cd=inst_cd)
        if row is None or not self.is_case_applied(row):
            return []
        return [row]

    async def map_case_ids_to_latest_hist(self, svc_code: str, *, inst_cd: str):
        return {}


def test_materialize_require_applied_rejects_draft_only():
    async def _run() -> None:
        tc_repo = _FakeTcRepo()
        svc = TestCaseService(
            metadata_repo=None,  # type: ignore[arg-type]
            registry_repo=_FakeRegistry(),  # type: ignore[arg-type]
            cbs_catalog_repo=_FakeCbs(),  # type: ignore[arg-type]
            case_repo=_FakeCaseRepo(applied=False),  # type: ignore[arg-type]
            tc_repo=tc_repo,  # type: ignore[arg-type]
        )
        with pytest.raises(InvalidInputError, match="확정"):
            await svc.materialize_one_case(
                "PY016",
                "PY016-N-001",
                inst_cd=DEFAULT_INST_CD,
                require_applied=True,
            )

    asyncio.run(_run())


def test_materialize_require_applied_uses_applied_rule():
    async def _run() -> None:
        tc_repo = _FakeTcRepo()
        svc = TestCaseService(
            metadata_repo=None,  # type: ignore[arg-type]
            registry_repo=_FakeRegistry(),  # type: ignore[arg-type]
            cbs_catalog_repo=_FakeCbs(),  # type: ignore[arg-type]
            case_repo=_FakeCaseRepo(applied=True),  # type: ignore[arg-type]
            tc_repo=tc_repo,  # type: ignore[arg-type]
        )
        row = await svc.materialize_one_case(
            "PY016",
            "PY016-N-001",
            inst_cd=DEFAULT_INST_CD,
            require_applied=True,
        )
        assert row.rule_case_id == "PY016-N-001"

    asyncio.run(_run())


def test_list_scenario_eligible_only_returns_applied():
    async def _run() -> None:
        tc_repo = _FakeTcRepo()
        svc = TestCaseService(
            metadata_repo=None,  # type: ignore[arg-type]
            registry_repo=_FakeRegistry(),  # type: ignore[arg-type]
            cbs_catalog_repo=_FakeCbs(),  # type: ignore[arg-type]
            case_repo=_FakeCaseRepo(applied=True),  # type: ignore[arg-type]
            tc_repo=tc_repo,  # type: ignore[arg-type]
        )
        rows = await svc.list_by_service_code(
            "PY016",
            inst_cd=DEFAULT_INST_CD,
            scenario_eligible=True,
        )
        assert len(rows) == 1
        assert rows[0].rule_case_id == "PY016-N-001"

    asyncio.run(_run())

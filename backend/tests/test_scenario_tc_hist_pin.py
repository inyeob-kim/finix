"""Scenario steps pin fnx_testcase_hist versions and run from snapshots."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

from app.core.exceptions import InvalidInputError
from app.domain.inst_scope import DEFAULT_INST_CD
from app.models.fnx_testcase_hist import FnxTestcaseHist
from app.repositories.fnx_testcase_repo import FnxTestcaseRepository
from app.services.live_pool_body import apply_live_pool_bodies_to_testcases
from app.services.scenario_testcase_loader import list_testcases_for_steps
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.db.base import Base


async def _session() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    return factory()


async def _seed_tc_with_hist(repo: FnxTestcaseRepository):
    row = await repo.upsert(
        inst_cd=DEFAULT_INST_CD,
        svc_code="CU008",
        rule_case_id="CU008-N-001",
        name="[N] CU008-N-001 · v1",
        http_method="POST",
        endpoint="/cu008",
        request_body_json='{"a":1}',
        expected_status=200,
        expected_body_json="{}",
        change_kind="materialize",
    )
    assert row is not None
    return row


def test_pinned_step_uses_hist_snapshot_not_live():
    async def _run() -> None:
        session = await _session()
        try:
            repo = FnxTestcaseRepository(session)
            await _seed_tc_with_hist(repo)
            hist_v1 = await repo.latest_hist(
                inst_cd=DEFAULT_INST_CD,
                svc_code="CU008",
                rule_case_id="CU008-N-001",
            )
            assert hist_v1 is not None
            pin = hist_v1.version

            await repo.upsert(
                inst_cd=DEFAULT_INST_CD,
                svc_code="CU008",
                rule_case_id="CU008-N-001",
                name="[N] CU008-N-001 · v2",
                http_method="POST",
                endpoint="/cu008",
                request_body_json='{"a":2}',
                expected_status=200,
                expected_body_json="{}",
                change_kind="materialize",
            )

            steps_json = json.dumps(
                [
                    {
                        "service_code": "CU008",
                        "rule_case_id": "CU008-N-001",
                        "tc_hist_version": pin,
                    }
                ]
            )
            loaded = await list_testcases_for_steps(
                steps_json=steps_json,
                tc_repo=repo,
                inst_cd=DEFAULT_INST_CD,
            )
            assert len(loaded) == 1
            assert loaded[0].name.endswith("v1")
            assert json.loads(loaded[0].request_body_json or "{}") == {"a": 1}
            assert getattr(loaded[0], "scenario_tc_hist_version") == pin

            await apply_live_pool_bodies_to_testcases(repo, loaded)
            assert loaded[0].name.endswith("v1")
            assert json.loads(loaded[0].request_body_json or "{}") == {"a": 1}
        finally:
            await session.close()

    asyncio.run(_run())


def test_unpinned_step_follows_live_pool():
    async def _run() -> None:
        session = await _session()
        try:
            repo = FnxTestcaseRepository(session)
            await _seed_tc_with_hist(repo)
            await repo.upsert(
                inst_cd=DEFAULT_INST_CD,
                svc_code="CU008",
                rule_case_id="CU008-N-001",
                name="[N] CU008-N-001 · v2",
                http_method="POST",
                endpoint="/cu008",
                request_body_json='{"a":2}',
                expected_status=200,
                expected_body_json="{}",
            )
            steps_json = json.dumps(
                [{"service_code": "CU008", "rule_case_id": "CU008-N-001"}]
            )
            loaded = await list_testcases_for_steps(
                steps_json=steps_json,
                tc_repo=repo,
                inst_cd=DEFAULT_INST_CD,
            )
            await apply_live_pool_bodies_to_testcases(repo, loaded)
            assert loaded[0].name.endswith("v2")
            assert json.loads(loaded[0].request_body_json or "{}") == {"a": 2}
        finally:
            await session.close()

    asyncio.run(_run())


def test_missing_pin_raises():
    async def _run() -> None:
        session = await _session()
        try:
            repo = FnxTestcaseRepository(session)
            await _seed_tc_with_hist(repo)
            steps_json = json.dumps(
                [
                    {
                        "service_code": "CU008",
                        "rule_case_id": "CU008-N-001",
                        "tc_hist_version": 999,
                    }
                ]
            )
            with pytest.raises(InvalidInputError, match="핀된 테스트케이스"):
                await list_testcases_for_steps(
                    steps_json=steps_json,
                    tc_repo=repo,
                    inst_cd=DEFAULT_INST_CD,
                )
        finally:
            await session.close()

    asyncio.run(_run())


def test_testcase_from_hist_shape():
    hist = FnxTestcaseHist(
        inst_cd=DEFAULT_INST_CD,
        svc_code="CU008",
        rule_case_id="CU008-N-001",
        version=3,
        change_kind="materialize",
        snapshot_json=json.dumps(
            {
                "name": "n",
                "http_method": "POST",
                "endpoint": "/x",
                "request_body_json": '{"k":1}',
                "expected_status": 200,
                "expected_body_json": "{}",
                "assertions_json": None,
                "rule_case_hist_version": 2,
            }
        ),
        checksum="abc",
        rule_case_hist_version=2,
    )
    tc = FnxTestcaseRepository.testcase_from_hist(hist)
    assert tc.rule_case_id == "CU008-N-001"
    assert getattr(tc, "scenario_tc_hist_version") == 3
    assert json.loads(tc.request_body_json or "{}") == {"k": 1}

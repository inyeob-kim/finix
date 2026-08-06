"""Smoke test for stepwise execution progress events."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

from app.services.execution_service import ExecutionService


def test_iter_run_emits_step_progress_events():
    tc = SimpleNamespace(
        inst_cd="1001",
        svc_code="CU008",
        rule_case_id="CU008-N-001",
        rule_case_hist_version=None,
        name="CU008-N-001 sample",
        http_method="POST",
        endpoint="/api/customer",
        request_body_json="{}",
        expected_status=200,
        expected_body_json='{"outcome":"success"}',
    )

    execution_repo = AsyncMock()
    execution_repo.create_run = AsyncMock(
        return_value=SimpleNamespace(id=99),
    )
    execution_repo.add_step_result = AsyncMock()
    execution_repo.update_run = AsyncMock()

    service = ExecutionService(
        metadata_repo=AsyncMock(),
        registry_repo=AsyncMock(),
        execution_repo=execution_repo,
        fnx_tc_repo=AsyncMock(),
        generator_service=None,
    )

    async def collect() -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        async for event in service._iter_run_for_testcases(
            scenario_id=1,
            testcases=[tc],
            steps_json="[]",
            base_url="",
            mode="simulate",
            postman_config=None,
            inst_cd="1001",
        ):
            events.append(event)
        return events

    events = asyncio.run(collect())
    types = [e["type"] for e in events]
    assert types == [
        "run_started",
        "step_started",
        "step_finished",
        "done",
    ]
    assert events[0]["execution_id"] == 99
    assert events[1]["step_label"] == "CU008-N-001 sample"
    assert events[2]["status"] in {"passed", "failed"}
    assert events[3]["execution_id"] == 99
    execution_repo.add_step_result.assert_awaited()
    execution_repo.update_run.assert_awaited()

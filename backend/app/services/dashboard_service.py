"""Dashboard aggregates for Runner + Data Pool KPIs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fnx_execution_run import ExecutionRun
from app.models.fnx_execution_step_result import ExecutionStepResult
from app.models.fnx_pool_sample import PoolSample
from app.utils.json_text import loads_json


class DashboardService:
    """Read-only KPI queries for History / overview."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def overview(
        self,
        *,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
    ) -> dict[str, Any]:
        pool_total = await self._count_pool()
        happy = await self._count_pool(path_kind="happy")
        negative = await self._count_pool(path_kind="negative")
        by_source = await self._pool_by_source()
        by_service = await self._pool_by_service()

        run_q = select(ExecutionRun)
        if created_from is not None:
            run_q = run_q.where(ExecutionRun.created_at >= created_from)
        if created_to is not None:
            run_q = run_q.where(ExecutionRun.created_at <= created_to)
        runs = list((await self._session.execute(run_q)).scalars().all())

        runs_total = len(runs)
        runs_completed = sum(1 for r in runs if r.status == "completed")
        step_passed = 0
        step_failed = 0
        assertion_passed = 0
        assertion_failed = 0
        expected_error_passed = 0
        expected_error_failed = 0
        happy_replay_passed = 0
        happy_replay_failed = 0

        for run in runs:
            summary = loads_json(run.summary_json, {}) or {}
            if isinstance(summary, dict):
                step_passed += int(summary.get("passed") or 0)
                step_failed += int(summary.get("failed") or 0)
                assertion_passed += int(summary.get("assertion_passed") or 0)
                assertion_failed += int(summary.get("assertion_failed") or 0)

        # Expected-error / happy classification from step labels (recent window)
        step_stmt = select(ExecutionStepResult)
        if runs:
            run_ids = [r.id for r in runs]
            step_stmt = step_stmt.where(ExecutionStepResult.execution_run_id.in_(run_ids))
            steps = list((await self._session.execute(step_stmt)).scalars().all())
            for step in steps:
                label = (step.step_label or "").strip()
                is_error_case = label.startswith("[E]")
                ok = step.status == "passed"
                if is_error_case:
                    if ok:
                        expected_error_passed += 1
                    else:
                        expected_error_failed += 1
                else:
                    if ok:
                        happy_replay_passed += 1
                    else:
                        happy_replay_failed += 1

        return {
            "pool": {
                "total": pool_total,
                "happy": happy,
                "negative": negative,
                "by_source": by_source,
                "by_service": by_service,
            },
            "executions": {
                "runs_total": runs_total,
                "runs_completed": runs_completed,
                "steps_passed": step_passed,
                "steps_failed": step_failed,
                "assertion_passed": assertion_passed,
                "assertion_failed": assertion_failed,
                "expected_error_passed": expected_error_passed,
                "expected_error_failed": expected_error_failed,
                "happy_replay_passed": happy_replay_passed,
                "happy_replay_failed": happy_replay_failed,
            },
        }

    async def _count_pool(self, *, path_kind: str | None = None) -> int:
        stmt = select(func.count()).select_from(PoolSample)
        if path_kind:
            stmt = stmt.where(PoolSample.path_kind == path_kind)
        return int((await self._session.execute(stmt)).scalar_one())

    async def _pool_by_source(self) -> dict[str, int]:
        stmt = (
            select(PoolSample.source, func.count())
            .group_by(PoolSample.source)
            .order_by(PoolSample.source.asc())
        )
        rows = (await self._session.execute(stmt)).all()
        return {str(source): int(count) for source, count in rows}

    async def _pool_by_service(self) -> list[dict[str, int | str]]:
        from app.repositories.pool_sample_repo import PoolSampleRepository

        return await PoolSampleRepository(self._session).coverage_by_service(limit=50)

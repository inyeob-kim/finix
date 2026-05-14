"""Async persistence for execution runs and step-level results."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.execution_run import ExecutionRun
from app.models.execution_step_result import ExecutionStepResult


class ExecutionRepository:
    """Data access for execution aggregates."""

    def __init__(self, session: AsyncSession) -> None:
        """
        Initialize the repository with a database session.

        Args:
            session: Active async SQLAlchemy session.
        """
        self._session = session

    async def create_run(
        self,
        *,
        scenario_id: int | None,
        base_url: str,
        status: str,
        summary_json: str | None,
    ) -> ExecutionRun:
        """
        Insert a new execution run row.

        Args:
            scenario_id: Optional originating scenario.
            base_url: Target system base URL used for the run.
            status: Aggregate status label.
            summary_json: Optional JSON-encoded counters or metadata.

        Returns:
            Persisted ExecutionRun.
        """
        row = ExecutionRun(
            scenario_id=scenario_id,
            base_url=base_url,
            status=status,
            summary_json=summary_json,
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return row

    async def add_step_result(
        self,
        *,
        execution_run_id: int,
        step_index: int,
        step_label: str,
        testcase_id: int | None,
        status: str,
        expected_json: str | None,
        actual_json: str | None,
        error_message: str | None,
    ) -> ExecutionStepResult:
        """
        Insert one step outcome row for a run.

        Returns:
            Persisted ExecutionStepResult.
        """
        row = ExecutionStepResult(
            execution_run_id=execution_run_id,
            step_index=step_index,
            step_label=step_label,
            testcase_id=testcase_id,
            status=status,
            expected_json=expected_json,
            actual_json=actual_json,
            error_message=error_message,
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return row

    async def get_run_by_id(self, run_id: int) -> ExecutionRun | None:
        """Load an execution run by id."""
        result = await self._session.execute(
            select(ExecutionRun).where(ExecutionRun.id == run_id)
        )
        return result.scalar_one_or_none()

    async def update_run(
        self,
        run_id: int,
        *,
        status: str | None = None,
        summary_json: str | None = None,
    ) -> ExecutionRun | None:
        """Patch aggregate fields on an execution run."""
        row = await self.get_run_by_id(run_id)
        if row is None:
            return None
        if status is not None:
            row.status = status
        if summary_json is not None:
            row.summary_json = summary_json
        await self._session.flush()
        await self._session.refresh(row)
        return row

    async def get_run_with_steps(self, run_id: int) -> ExecutionRun | None:
        """
        Load a run and eagerly fetch ordered step results.

        Returns:
            ExecutionRun with ``execution_step_results`` populated, or None.
        """
        result = await self._session.execute(
            select(ExecutionRun)
            .options(selectinload(ExecutionRun.execution_step_results))
            .where(ExecutionRun.id == run_id)
        )
        run = result.scalar_one_or_none()
        if run is None:
            return None
        run.execution_step_results.sort(key=lambda r: r.step_index)
        return run

    async def list_runs(
        self,
        *,
        limit: int,
        offset: int,
    ) -> tuple[list[ExecutionRun], int]:
        """
        Page execution runs newest first.

        Returns:
            Tuple of rows and total count.
        """
        count_stmt = select(func.count()).select_from(ExecutionRun)
        total = int(
            (await self._session.execute(count_stmt)).scalar_one(),
        )
        stmt = (
            select(ExecutionRun)
            .order_by(ExecutionRun.id.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = list((await self._session.execute(stmt)).scalars().all())
        return rows, total

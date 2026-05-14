"""Business logic for executing tests and recording outcomes."""

from __future__ import annotations

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.core.logger import get_logger
from app.models.execution_log import ExecutionLog
from app.models.execution_run import ExecutionRun
from app.repositories.execution_repo import ExecutionRepository
from app.repositories.metadata_repo import MetadataRepository
from app.repositories.service_registry_repo import ServiceRegistryRepository
from app.services.execution_simulator import simulate_response
from app.utils.json_text import dumps_json, loads_json

logger = get_logger(__name__)


class ExecutionService:
    """Runs test cases against registered runners or deterministic stubs."""

    def __init__(
        self,
        *,
        metadata_repo: MetadataRepository,
        registry_repo: ServiceRegistryRepository,
        execution_repo: ExecutionRepository,
    ) -> None:
        """Construct the service with its data dependencies."""
        self._metadata = metadata_repo
        self._registry = registry_repo
        self._execution = execution_repo

    async def run_testcase(
        self,
        *,
        testcase_id: int,
        runner_name: str | None,
    ) -> ExecutionLog:
        """Legacy single-testcase stub execution."""
        await self._registry.ensure_default_runner_stub()
        testcase = await self._metadata.get_testcase_by_id(testcase_id)
        if testcase is None:
            raise EntityNotFoundError("TestCase", testcase_id)

        services = await self._registry.list_services()
        if not services:
            raise EntityNotFoundError("RegisteredService", runner_name or "any")

        runner = None
        if runner_name:
            runner = await self._registry.get_by_name(runner_name)
            if runner is None:
                raise EntityNotFoundError("RegisteredService", runner_name)
        else:
            runner = services[0]

        detail = (
            f"Stub run against runner={runner.name!r} url={runner.base_url!r}; "
            f"steps_length={len(testcase.steps or '')}"
        )
        log = await self._metadata.create_execution_log(
            testcase_id=testcase.id,
            status="completed",
            detail=detail,
        )
        logger.info(
            "Execution finished",
            extra={
                "execution_id": log.id,
                "testcase_id": testcase.id,
                "runner": runner.name,
            },
        )
        return log

    async def create_run_for_scenario(
        self,
        *,
        scenario_id: int,
        base_url: str,
    ) -> ExecutionRun:
        """Execute all test cases for a scenario and persist structured results."""
        await self._registry.ensure_default_runner_stub()
        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        testcases = await self._metadata.list_testcases_for_scenario(scenario_id)
        if not testcases:
            raise InvalidInputError("시나리오에 생성된 테스트 케이스가 없습니다.")

        run = await self._execution.create_run(
            scenario_id=scenario_id,
            base_url=base_url or "",
            status="running",
            summary_json=None,
        )
        passed = 0
        failed = 0
        for idx, tc in enumerate(testcases):
            actual_status, actual_body = simulate_response(tc)
            exp_status = tc.expected_status
            ok = actual_status == exp_status
            if ok:
                passed += 1
                err = None
            else:
                failed += 1
                err = f"예상 HTTP {exp_status}, 실제 {actual_status}"
            expected_payload = {
                "status": exp_status,
                "body": loads_json(tc.expected_body_json, {}),
            }
            actual_payload = {"status": actual_status, "body": actual_body}
            await self._execution.add_step_result(
                execution_run_id=run.id,
                step_index=tc.step_index if tc.step_index is not None else idx,
                step_label=tc.name,
                testcase_id=tc.id,
                status="passed" if ok else "failed",
                expected_json=dumps_json(expected_payload),
                actual_json=dumps_json(actual_payload),
                error_message=err,
            )

        summary = dumps_json({"passed": passed, "failed": failed})
        await self._execution.update_run(
            run.id,
            status="completed",
            summary_json=summary,
        )
        full = await self._execution.get_run_with_steps(run.id)
        assert full is not None
        logger.info(
            "Multi-step execution completed",
            extra={"execution_run_id": run.id, "passed": passed, "failed": failed},
        )
        return full

    async def get_run(self, run_id: int) -> ExecutionRun:
        """Load execution run with ordered steps."""
        run = await self._execution.get_run_with_steps(run_id)
        if run is None:
            raise EntityNotFoundError("ExecutionRun", run_id)
        return run

    async def list_runs_page(self, *, limit: int, offset: int) -> tuple[list[ExecutionRun], int]:
        """Paginate execution history."""
        return await self._execution.list_runs(limit=limit, offset=offset)

"""Business logic for executing tests and recording outcomes."""

from __future__ import annotations

import time
from datetime import datetime

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.core.logger import get_logger
from app.domain.execution_assertion_catalog import INJECT_WARNING
from app.domain.execution_step_evaluator import (
    StepAssertion,
    evaluate_live_step_result,
    evaluate_simulate_step_result,
)
from app.models.execution_log import ExecutionLog
from app.models.execution_run import ExecutionRun
from app.repositories.execution_repo import ExecutionRepository
from app.repositories.metadata_repo import MetadataRepository
from app.repositories.service_registry_repo import ServiceRegistryRepository
from app.services.collection_var_generator_service import CollectionVarGeneratorService
from app.services.execution_simulator import simulate_response
from app.services.scenario_run_resolver import resolve_scenario_run
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
        generator_service: CollectionVarGeneratorService | None = None,
    ) -> None:
        """Construct the service with its data dependencies."""
        self._metadata = metadata_repo
        self._registry = registry_repo
        self._execution = execution_repo
        self._generators = generator_service

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
        mode: str = "simulate",
    ) -> ExecutionRun:
        """Execute all test cases for a scenario and persist structured results."""
        from app.domain.postman_bxm_system_header import (
            step_service_codes_from_steps,
        )
        from app.services.http_scenario_runner import (
            initial_context_from_postman,
            join_base_url_and_endpoint,
            make_live_response_callback,
        )
        from app.utils.scenario_steps_document import parse_steps_document

        await self._registry.ensure_default_runner_stub()
        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        testcases = await self._metadata.list_testcases_for_scenario(scenario_id)
        if not testcases:
            raise InvalidInputError("시나리오에 생성된 테스트 케이스가 없습니다.")

        _raw_steps, postman_config = parse_steps_document(scenario.steps_json)
        effective_base = base_url.strip() or (
            postman_config.base_url.strip() if postman_config else ""
        )
        if mode == "live" and not effective_base:
            raise InvalidInputError("Live 실행에는 base_url이 필요합니다.")

        step_service_codes = step_service_codes_from_steps(scenario.steps_json)
        catalog = (
            await self._generators.build_catalog_map()
            if self._generators is not None
            else None
        )
        initial_context = initial_context_from_postman(
            postman_config,
            catalog=catalog,
        )

        run = await self._execution.create_run(
            scenario_id=scenario_id,
            base_url=effective_base,
            status="running",
            summary_json=None,
        )
        run_started = time.perf_counter()

        if mode == "live":
            response_fn = make_live_response_callback(
                base_url=effective_base,
                postman_config=postman_config,
                step_service_codes=step_service_codes,
            )
        else:
            response_fn = lambda tc, body: simulate_response(tc, request_body=body)

        preview = resolve_scenario_run(
            testcases,
            steps_json=scenario.steps_json,
            initial_context=initial_context,
            simulate_response=response_fn,
            generator_catalog=catalog,
        )
        passed = 0
        failed = 0
        assertion_passed = 0
        assertion_failed = 0
        response_times: list[int] = []
        for row in preview.steps:
            tc = next((t for t in testcases if t.id == row.testcase_id), None)
            if tc is None:
                continue
            actual_status = row.actual_status if row.actual_status is not None else tc.expected_status
            actual_body = row.actual_body
            exp_status = tc.expected_status
            exp_body = loads_json(tc.expected_body_json, {})
            if not isinstance(exp_body, dict):
                exp_body = {}

            if mode == "live":
                evaluation = evaluate_live_step_result(
                    testcase_name=tc.name or "",
                    expected_status=exp_status,
                    expected_body=exp_body,
                    actual_status=actual_status,
                    actual_body=actual_body,
                )
            else:
                evaluation = evaluate_simulate_step_result(
                    testcase_name=tc.name or "",
                    expected_status=exp_status,
                    expected_body=exp_body,
                    actual_status=actual_status,
                    actual_body=actual_body,
                )

            assertions: list[StepAssertion] = list(evaluation.assertions)
            for warning in row.inject_warnings:
                assertions.append(
                    StepAssertion(name=INJECT_WARNING, passed=False, message=warning),
                )

            for assertion in assertions:
                if assertion.passed:
                    assertion_passed += 1
                else:
                    assertion_failed += 1

            ok = all(a.passed for a in assertions)
            err_parts = [a.message for a in assertions if not a.passed and a.message]
            err = "; ".join(err_parts) if err_parts else None
            if ok:
                passed += 1
            else:
                failed += 1

            if row.response_time_ms is not None:
                response_times.append(row.response_time_ms)

            method = (row.method or tc.http_method or "POST").strip().upper()
            request_url = row.request_url or join_base_url_and_endpoint(
                effective_base,
                tc.endpoint,
            )
            expected_payload = {
                "status": exp_status,
                "body": loads_json(tc.expected_body_json, {}),
            }
            actual_payload = {
                "status": actual_status,
                "body": actual_body,
                "context_after": row.context_after_step or preview.context_after,
                "template_request_body": row.template_request_body,
                "resolved_request_body": row.resolved_request_body,
                "method": method,
                "endpoint": row.endpoint or tc.endpoint,
                "request_url": request_url,
                "response_time_ms": row.response_time_ms,
                "response_size_bytes": row.response_size_bytes,
                "assertions": [
                    {
                        "name": a.name,
                        "passed": a.passed,
                        "message": a.message,
                    }
                    for a in assertions
                ],
            }
            await self._execution.add_step_result(
                execution_run_id=run.id,
                step_index=row.step_index,
                step_label=tc.name,
                testcase_id=tc.id,
                status="passed" if ok else "failed",
                expected_json=dumps_json(expected_payload),
                actual_json=dumps_json(actual_payload),
                error_message=err,
            )

        duration_ms = int((time.perf_counter() - run_started) * 1000)
        avg_response_time_ms = (
            int(sum(response_times) / len(response_times))
            if response_times
            else None
        )
        summary = dumps_json(
            {
                "passed": passed,
                "failed": failed,
                "assertion_passed": assertion_passed,
                "assertion_failed": assertion_failed,
                "duration_ms": duration_ms,
                "avg_response_time_ms": avg_response_time_ms,
                "mode": mode,
            },
        )
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

    async def list_runs_page(
        self,
        *,
        limit: int,
        offset: int,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        scenario_id: int | None = None,
    ) -> tuple[list[ExecutionRun], int]:
        """Paginate execution history."""
        return await self._execution.list_runs(
            limit=limit,
            offset=offset,
            created_from=created_from,
            created_to=created_to,
            scenario_id=scenario_id,
        )


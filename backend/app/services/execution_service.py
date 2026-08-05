"""Business logic for executing tests and recording outcomes."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

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
from app.services.scenario_run_resolver import (
    bindings_by_logical_step,
    resolve_one_testcase_step,
)
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
        prepared = await self._prepare_scenario_run(
            scenario_id=scenario_id,
            base_url=base_url,
            mode=mode,
        )
        return await self._create_run_for_testcases(**prepared)

    async def iter_run_for_scenario(
        self,
        *,
        scenario_id: int,
        base_url: str,
        mode: str = "simulate",
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute a scenario and yield progress events (for SSE)."""
        prepared = await self._prepare_scenario_run(
            scenario_id=scenario_id,
            base_url=base_url,
            mode=mode,
        )
        async for event in self._iter_run_for_testcases(**prepared):
            yield event

    async def _prepare_scenario_run(
        self,
        *,
        scenario_id: int,
        base_url: str,
        mode: str,
    ) -> dict[str, Any]:
        from app.utils.scenario_steps_document import parse_steps_document

        await self._registry.ensure_default_runner_stub()
        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        testcases = await self._metadata.list_testcases_for_scenario(scenario_id)
        if not testcases:
            raise InvalidInputError("시나리오에 생성된 테스트 케이스가 없습니다.")

        from app.services.live_pool_body import apply_live_pool_bodies_to_testcases

        await apply_live_pool_bodies_to_testcases(
            self._metadata,
            testcases,
            steps_json=scenario.steps_json,
        )

        _raw_steps, postman_config = parse_steps_document(scenario.steps_json)
        effective_base = base_url.strip() or (
            postman_config.base_url.strip() if postman_config else ""
        )
        if mode == "live" and not effective_base:
            raise InvalidInputError("Live 실행에는 base_url이 필요합니다.")

        return {
            "scenario_id": scenario_id,
            "testcases": testcases,
            "steps_json": scenario.steps_json,
            "base_url": effective_base,
            "mode": mode,
            "postman_config": postman_config,
        }

    async def create_run_for_testcase(
        self,
        *,
        testcase_id: int,
        base_url: str = "",
        mode: str = "simulate",
        postman_config: object | None = None,
    ) -> ExecutionRun:
        """Execute one pool/standalone test case (no scenario required)."""
        from app.domain.postman_collection_config import PostmanCollectionConfig
        from app.utils.scenario_steps_document import parse_postman_config

        await self._registry.ensure_default_runner_stub()
        testcase = await self._metadata.get_testcase_by_id(testcase_id)
        if testcase is None:
            raise EntityNotFoundError("TestCase", testcase_id)

        parsed: PostmanCollectionConfig | None = None
        if isinstance(postman_config, PostmanCollectionConfig):
            parsed = postman_config
        elif isinstance(postman_config, dict):
            try:
                parsed = PostmanCollectionConfig.model_validate(postman_config)
            except Exception:  # noqa: BLE001
                parsed = parse_postman_config({"postman": postman_config})

        effective_base = (base_url or "").strip() or (
            parsed.base_url.strip() if parsed is not None else ""
        )
        if mode == "live" and not effective_base:
            raise InvalidInputError("Live 실행에는 base_url이 필요합니다.")

        return await self._create_run_for_testcases(
            scenario_id=None,
            testcases=[testcase],
            steps_json=None,
            base_url=effective_base,
            mode=mode,
            postman_config=parsed,
        )

    async def create_run_for_service_testcases(
        self,
        *,
        service_code: str,
        base_url: str = "",
        mode: str = "simulate",
        postman_config: object | None = None,
        limit: int = 500,
    ) -> ExecutionRun:
        """Execute all materialized pool test cases for one CBS service code."""
        from app.domain.postman_collection_config import PostmanCollectionConfig
        from app.utils.scenario_steps_document import parse_postman_config

        code = (service_code or "").strip()
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")

        await self._registry.ensure_default_runner_stub()
        testcases = await self._metadata.list_testcases_for_service_code(
            code,
            limit=limit,
        )
        if not testcases:
            raise InvalidInputError(
                "이 서비스에 적재된 테스트케이스가 없습니다.",
            )
        # Ascending id ≈ case order; list API returns newest-first.
        testcases = sorted(testcases, key=lambda row: row.id)

        parsed: PostmanCollectionConfig | None = None
        if isinstance(postman_config, PostmanCollectionConfig):
            parsed = postman_config
        elif isinstance(postman_config, dict):
            try:
                parsed = PostmanCollectionConfig.model_validate(postman_config)
            except Exception:  # noqa: BLE001
                parsed = parse_postman_config({"postman": postman_config})

        effective_base = (base_url or "").strip() or (
            parsed.base_url.strip() if parsed is not None else ""
        )
        if mode == "live" and not effective_base:
            raise InvalidInputError("Live 실행에는 base_url이 필요합니다.")

        return await self._create_run_for_testcases(
            scenario_id=None,
            testcases=testcases,
            steps_json=None,
            base_url=effective_base,
            mode=mode,
            postman_config=parsed,
        )

    async def _create_run_for_testcases(
        self,
        *,
        scenario_id: int | None,
        testcases: list,
        steps_json: str | None,
        base_url: str,
        mode: str,
        postman_config: object | None,
    ) -> ExecutionRun:
        """Shared multi-step execution for scenario or single testcase runs."""
        execution_id: int | None = None
        async for event in self._iter_run_for_testcases(
            scenario_id=scenario_id,
            testcases=testcases,
            steps_json=steps_json,
            base_url=base_url,
            mode=mode,
            postman_config=postman_config,
        ):
            if event.get("type") == "done":
                execution_id = int(event["execution_id"])
        if execution_id is None:
            raise InvalidInputError("실행 결과를 생성하지 못했습니다.")
        full = await self._execution.get_run_with_steps(execution_id)
        assert full is not None
        return full

    async def _iter_run_for_testcases(
        self,
        *,
        scenario_id: int | None,
        testcases: list,
        steps_json: str | None,
        base_url: str,
        mode: str,
        postman_config: object | None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute testcases one-by-one and yield progress events."""
        from app.domain.postman_bxm_system_header import (
            step_service_codes_from_steps,
        )
        from app.services.http_scenario_runner import (
            initial_context_from_postman,
            join_base_url_and_endpoint,
            make_live_response_callback,
        )

        step_service_codes = step_service_codes_from_steps(steps_json)
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
            base_url=base_url,
            status="running",
            summary_json=None,
        )
        run_started = time.perf_counter()
        total = len(testcases)
        yield {
            "type": "run_started",
            "execution_id": run.id,
            "total": total,
            "scenario_id": scenario_id,
        }

        if mode == "live":
            response_fn = make_live_response_callback(
                base_url=base_url,
                postman_config=postman_config,
                step_service_codes=step_service_codes or None,
            )
        else:
            response_fn = lambda tc, body: simulate_response(tc, request_body=body)

        bindings = bindings_by_logical_step(steps_json)
        context: dict[str, Any] = dict(initial_context)
        passed = 0
        failed = 0
        assertion_passed = 0
        assertion_failed = 0
        response_times: list[int] = []

        for idx, tc in enumerate(testcases):
            step_label = tc.name or f"Step {idx + 1}"
            yield {
                "type": "step_started",
                "execution_id": run.id,
                "step_index": idx,
                "total": total,
                "step_label": step_label,
                "testcase_id": tc.id,
            }

            row, context, _warnings = resolve_one_testcase_step(
                tc,
                idx=idx,
                bindings=bindings,
                context=context,
                simulate_response=response_fn,
                generator_catalog=catalog,
            )

            actual_status = (
                row.actual_status if row.actual_status is not None else tc.expected_status
            )
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
            status = "passed" if ok else "failed"
            if ok:
                passed += 1
            else:
                failed += 1

            if row.response_time_ms is not None:
                response_times.append(row.response_time_ms)

            method = (row.method or tc.http_method or "POST").strip().upper()
            request_url = row.request_url or join_base_url_and_endpoint(
                base_url,
                tc.endpoint,
            )
            expected_payload = {
                "status": exp_status,
                "body": loads_json(tc.expected_body_json, {}),
            }
            actual_payload = {
                "status": actual_status,
                "body": actual_body,
                "context_after": row.context_after_step or context,
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
                step_label=step_label,
                testcase_id=tc.id,
                status=status,
                expected_json=dumps_json(expected_payload),
                actual_json=dumps_json(actual_payload),
                error_message=err,
            )
            yield {
                "type": "step_finished",
                "execution_id": run.id,
                "step_index": idx,
                "total": total,
                "step_label": step_label,
                "testcase_id": tc.id,
                "status": status,
                "error_message": err,
            }

        duration_ms = int((time.perf_counter() - run_started) * 1000)
        avg_response_time_ms = (
            int(sum(response_times) / len(response_times))
            if response_times
            else None
        )
        summary = {
            "passed": passed,
            "failed": failed,
            "assertion_passed": assertion_passed,
            "assertion_failed": assertion_failed,
            "duration_ms": duration_ms,
            "avg_response_time_ms": avg_response_time_ms,
            "mode": mode,
        }
        await self._execution.update_run(
            run.id,
            status="completed",
            summary_json=dumps_json(summary),
        )
        logger.info(
            "Multi-step execution completed",
            extra={"execution_run_id": run.id, "passed": passed, "failed": failed},
        )
        yield {
            "type": "done",
            "execution_id": run.id,
            "scenario_id": scenario_id,
            "status": "completed",
            "summary": summary,
        }

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


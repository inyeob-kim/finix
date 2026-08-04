"""Load scenarios/testcases and produce binding resolve previews."""

from __future__ import annotations

from typing import Any

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.models.testcase import TestCase
from app.repositories.metadata_repo import MetadataRepository
from app.schemas.scenario_resolve_schema import ScenarioResolvePreviewRead, preview_to_read
from app.schemas.scenario_schema import ScenarioStepRead
from app.services.execution_simulator import simulate_response
from app.services.scenario_run_resolver import resolve_scenario_run
from app.utils.json_text import dumps_json, loads_json


class ScenarioResolveService:
    """Orchestrates resolve-preview for saved scenarios and inline registry payloads."""

    def __init__(self, *, metadata_repo: MetadataRepository) -> None:
        self._metadata = metadata_repo

    async def preview_for_scenario(
        self,
        scenario_id: int,
        *,
        simulate_responses: bool = True,
    ) -> ScenarioResolvePreviewRead:
        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        testcases = await self._metadata.list_testcases_for_scenario(scenario_id)
        if not testcases:
            raise InvalidInputError(
                "시나리오에 연결된 테스트 케이스가 없습니다. 풀에서 선택 후 연결(attach)하세요.",
            )
        return self._resolve_rows(
            testcases,
            steps_json=scenario.steps_json,
            simulate_responses=simulate_responses,
        )

    async def preview_inline(
        self,
        *,
        steps: list[ScenarioStepRead],
        per_step: list[list[int]],
        simulate_responses: bool = True,
    ) -> ScenarioResolvePreviewRead:
        if not per_step:
            raise InvalidInputError("per_step가 필요합니다.")
        ordered: list[TestCase] = []
        for step_i, ids in enumerate(per_step):
            for tid in ids:
                tc = await self._metadata.get_testcase_by_id(int(tid))
                if tc is None:
                    raise EntityNotFoundError("TestCase", int(tid))
                ordered.append(
                    TestCase(
                        id=tc.id,
                        scenario_id=tc.scenario_id,
                        name=tc.name,
                        steps=tc.steps,
                        http_method=tc.http_method,
                        endpoint=tc.endpoint,
                        request_body_json=tc.request_body_json,
                        expected_status=tc.expected_status,
                        expected_body_json=tc.expected_body_json,
                        step_index=step_i,
                        rule_history_id=tc.rule_history_id,
                    ),
                )
        steps_dump = [s.model_dump() for s in steps]
        return self._resolve_rows(
            ordered,
            steps_json=dumps_json(steps_dump),
            simulate_responses=simulate_responses,
        )

    def _resolve_rows(
        self,
        testcases: list[TestCase],
        *,
        steps_json: str | None,
        simulate_responses: bool,
    ) -> ScenarioResolvePreviewRead:
        sim = None
        if simulate_responses:

            def sim(tc: TestCase, body: dict[str, Any]) -> tuple[int, Any]:
                return simulate_response(tc, request_body=body)

        preview = resolve_scenario_run(
            testcases,
            steps_json=steps_json,
            simulate_response=sim,
        )
        return preview_to_read(preview)

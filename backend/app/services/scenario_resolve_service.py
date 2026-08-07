"""Load scenarios/testcases and produce binding resolve previews."""

from __future__ import annotations

from typing import Any

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.models.fnx_testcase import FnxTestcase
from app.repositories.fnx_testcase_repo import FnxTestcaseRepository
from app.repositories.metadata_repo import MetadataRepository
from app.schemas.scenario_resolve_schema import ScenarioResolvePreviewRead, preview_to_read
from app.schemas.scenario_schema import ScenarioStepRead
from app.schemas.testcase_schema import TestCaseRefV1
from app.services.execution_simulator import simulate_response
from app.services.scenario_run_resolver import resolve_scenario_run
from app.services.scenario_testcase_loader import list_testcases_for_steps
from app.utils.json_text import dumps_json


class ScenarioResolveService:
    """Orchestrates resolve-preview for saved scenarios and inline registry payloads."""

    def __init__(
        self,
        *,
        metadata_repo: MetadataRepository,
        tc_repo: FnxTestcaseRepository,
    ) -> None:
        self._metadata = metadata_repo
        self._tc_repo = tc_repo

    async def preview_for_scenario(
        self,
        scenario_id: int,
        *,
        inst_cd: str,
        simulate_responses: bool = True,
    ) -> ScenarioResolvePreviewRead:
        from app.domain.inst_scope import require_inst_cd

        inst = require_inst_cd(inst_cd)
        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        testcases = await list_testcases_for_steps(
            steps_json=scenario.steps_json, tc_repo=self._tc_repo, inst_cd=inst
        )
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
        per_step: list[list[TestCaseRefV1]],
        inst_cd: str,
        simulate_responses: bool = True,
    ) -> ScenarioResolvePreviewRead:
        from app.domain.inst_scope import require_inst_cd

        inst = require_inst_cd(inst_cd)
        if not per_step:
            raise InvalidInputError("per_step가 필요합니다.")
        ordered: list[FnxTestcase] = []
        for refs in per_step:
            for ref in refs:
                if ref.tc_hist_version is not None:
                    hist = await self._tc_repo.get_hist(
                        inst_cd=inst,
                        svc_code=ref.svc_code,
                        rule_case_id=ref.rule_case_id,
                        version=ref.tc_hist_version,
                    )
                    if hist is None:
                        raise EntityNotFoundError(
                            "TestCaseHist",
                            f"{ref.svc_code}/{ref.rule_case_id}@{ref.tc_hist_version}",
                        )
                    ordered.append(self._tc_repo.testcase_from_hist(hist))
                    continue
                tc = await self._tc_repo.get(
                    inst_cd=inst, svc_code=ref.svc_code, rule_case_id=ref.rule_case_id
                )
                if tc is None:
                    raise EntityNotFoundError(
                        "TestCase", f"{ref.svc_code}/{ref.rule_case_id}"
                    )
                ordered.append(tc)
        steps_dump = [s.model_dump() for s in steps]
        steps_json = dumps_json(steps_dump)
        return self._resolve_rows(
            ordered,
            steps_json=steps_json,
            simulate_responses=simulate_responses,
        )

    def _resolve_rows(
        self,
        testcases: list[FnxTestcase],
        *,
        steps_json: str | None,
        simulate_responses: bool,
    ) -> ScenarioResolvePreviewRead:
        sim = None
        if simulate_responses:

            def sim(tc: FnxTestcase, body: dict[str, Any]) -> tuple[int, Any]:
                return simulate_response(tc, request_body=body)

        preview = resolve_scenario_run(
            testcases,
            steps_json=steps_json,
            simulate_response=sim,
        )
        return preview_to_read(preview)

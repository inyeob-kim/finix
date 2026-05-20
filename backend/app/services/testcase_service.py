"""Business logic for test case lifecycle."""

from __future__ import annotations

import json
from typing import Any

from app.config.testcase_templates import template_for_step_action
from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.core.logger import get_logger
from app.models.testcase import TestCase
from app.repositories.cbs_service_catalog_repo import CbsServiceCatalogRepository
from app.repositories.metadata_repo import MetadataRepository
from app.repositories.service_registry_repo import ServiceRegistryRepository
from app.repositories.service_rules_repo import ServiceRulesRepository
from app.rules_yaml.loader import load_service_rules
from app.utils.helpers import build_placeholder_body
from app.utils.json_text import dumps_json, loads_json
from app.utils.testcase_display_name import build_materialized_testcase_name

logger = get_logger(__name__)


class TestCaseService:
    """Coordinates test case generation and validation."""

    def __init__(
        self,
        *,
        metadata_repo: MetadataRepository,
        registry_repo: ServiceRegistryRepository,
        cbs_catalog_repo: CbsServiceCatalogRepository,
        service_rules_repo: ServiceRulesRepository | None = None,
    ) -> None:
        """Construct the service with its data dependencies."""
        self._metadata = metadata_repo
        self._registry = registry_repo
        self._cbs_catalog = cbs_catalog_repo
        self._service_rules_repo = service_rules_repo

    @staticmethod
    def _extract_service_code(row: dict[str, Any]) -> str | None:
        """Resolve service_code from structured field, reason line, or action prefix."""
        raw = row.get("service_code")
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
        reason = str(row.get("reason") or "")
        if "code=" in reason:
            after = reason.split("code=", 1)[1]
            code = after.split("|", 1)[0].strip()
            if code:
                return code
        action = str(row.get("action") or "").strip()
        if not action:
            return None
        first = action.split()[0].strip()
        if (
            2 <= len(first) <= 16
            and first.isalnum()
            and first.upper() == first
            and any(c.isdigit() for c in first)
        ):
            return first
        return None

    @staticmethod
    def _rule_count_from_json(rules_json: str | None) -> int:
        try:
            parsed = json.loads(rules_json or "{}")
        except Exception:  # noqa: BLE001
            return 0
        rules = parsed.get("rules") if isinstance(parsed, dict) else None
        if not isinstance(rules, list):
            return 0
        return len([r for r in rules if isinstance(r, dict)])

    async def _materialize_failure_message(self, code: str) -> str:
        """Explain why pool materialize produced zero test cases."""
        if self._service_rules_repo is not None:
            active = await self._service_rules_repo.get_active_bundle(code)
            if active is not None and self._rule_count_from_json(active.rules_json) == 0:
                return (
                    f"{code}: Active 규칙 번들(#{active.id})은 있으나 규칙이 비어 있습니다. "
                    "규칙/메타 관리에서 YAML을 수정하거나 새 번들을 등록하세요."
                )
            versions = await self._service_rules_repo.list_versions(code)
            with_rules = [
                b for b in versions if self._rule_count_from_json(b.rules_json) > 0
            ]
            if with_rules and active is None:
                primary = with_rules[0]
                rule_count = self._rule_count_from_json(primary.rules_json)
                others = with_rules[1:3]
                extra = ""
                if others:
                    extra = " 외 " + ", ".join(
                        f"{b.status} v{b.version}(#{b.id})" for b in others
                    )
                return (
                    f"{code}: YAML 규칙은 등록되어 있으나 Active 상태가 아닙니다. "
                    f"현재 {primary.status} v{primary.version}(#{primary.id}, "
                    f"규칙 {rule_count}건){extra}. "
                    "규칙/메타 관리에서 해당 번들을 Active로 활성화한 뒤 "
                    "다시 「YAML에서 생성」을 실행하세요."
                )
            if versions and active is None:
                return (
                    f"{code}: 규칙 번들은 있으나 Active로 지정된 번들이 없습니다. "
                    "규칙/메타 관리에서 번들을 Active로 활성화하세요."
                )
        file_bundle = load_service_rules(code)
        if file_bundle is None:
            return (
                f"{code}: 등록된 YAML 규칙이 없습니다. "
                "규칙/메타 관리에서 YAML을 등록한 뒤 Active로 활성화하거나, "
                f"rules_yaml/{code}.yaml 파일을 추가하세요."
            )
        if not file_bundle.rules:
            return (
                f"{code}: rules_yaml/{code}.yaml 파일은 있으나 rules 항목이 비어 있습니다."
            )
        return (
            f"{code}: 테스트케이스를 생성할 수 있는 Active YAML 규칙이 없습니다."
        )

    async def _load_rule_bundle(self, code: str) -> tuple[Any | None, int | None]:
        """Return (bundle_like, active_rule_bundle_id) from DB or file."""
        if self._service_rules_repo is None:
            bundle = load_service_rules(code)
            return (bundle, None)
        db_bundle = await self._service_rules_repo.get_active_bundle(code)
        if db_bundle is not None:
            active_id = db_bundle.id
            try:
                parsed = json.loads(db_bundle.rules_json or "{}")
            except Exception:  # noqa: BLE001
                parsed = {}
            rules = parsed.get("rules") or []
            if isinstance(rules, list):
                tmp = type(
                    "TmpBundle",
                    (),
                    {
                        "service_code": db_bundle.service_code,
                        "service_name": db_bundle.service_name_snapshot,
                        "source_version": db_bundle.source_version,
                        "rules": [r for r in rules if isinstance(r, dict)],
                    },
                )()
                return (tmp, active_id)
        bundle = load_service_rules(code)
        return (bundle, None)

    async def _append_cases_for_service(
        self,
        *,
        service_code: str,
        scenario_id: int | None,
        instruction: str | None,
        step_index_start: int,
    ) -> tuple[list[TestCase], int]:
        """Create one row per rule for ``service_code``. Returns (created, next_index)."""
        code = (service_code or "").strip()
        if not code:
            return [], step_index_start
        bundle, active_bundle_id = await self._load_rule_bundle(code)
        if bundle is None or not getattr(bundle, "rules", None):
            return [], step_index_start
        svc_meta = await self._cbs_catalog.get_by_service_code(code)
        method = svc_meta.http_method if svc_meta else "POST"
        endpoint = svc_meta.uri if svc_meta else f"/services/{code}"
        created: list[TestCase] = []
        step_index = step_index_start
        for rule_idx, rule in enumerate(bundle.rules):
            case_id = str(
                rule.get("case_id")
                or rule.get("rule_id")
                or f"{code}-CASE-{rule_idx + 1:03d}"
            )
            expect = rule.get("expect") or {}
            if not isinstance(expect, dict):
                expect = {}
            rule_input = rule.get("input") or rule.get("minimal_input") or {}
            if not isinstance(rule_input, dict):
                rule_input = {}

            raw_status = expect.get("http_status")
            if raw_status is None or raw_status == "":
                expected_status = None
            else:
                expected_status = int(raw_status)
            expected_body: dict[str, Any] = {"outcome": expect.get("outcome")}
            if "error_code" in expect:
                expected_body["error_code"] = expect.get("error_code")
            if "error_args" in expect:
                expected_body["error_args"] = expect.get("error_args")
            if "validation_target" in expect:
                expected_body["validation_target"] = expect.get("validation_target")

            name = build_materialized_testcase_name(
                case_id=case_id,
                rule=rule,
                instruction=instruction,
            )
            tc = await self._metadata.create_testcase(
                name=name,
                steps=None,
                scenario_id=scenario_id,
                http_method=method,
                endpoint=endpoint,
                request_body_json=dumps_json(rule_input),
                expected_status=expected_status,
                expected_body_json=dumps_json(expected_body),
                step_index=step_index,
                rule_bundle_id=active_bundle_id,
            )
            created.append(tc)
            step_index += 1
        return created, step_index

    async def materialize_pool_for_service(
        self,
        service_code: str,
        *,
        instruction: str | None = None,
        replace_existing: bool = True,
    ) -> list[TestCase]:
        """
        Create HTTP test cases for one service (no scenario), from active/file rules.

        Used as a TC pool before attaching to a scenario.
        """
        await self._registry.ensure_default_runner_stub()
        code = (service_code or "").strip()
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        if replace_existing:
            await self._metadata.delete_testcases_pool_for_service(code)
        created, _ = await self._append_cases_for_service(
            service_code=code,
            scenario_id=None,
            instruction=instruction,
            step_index_start=0,
        )
        if not created:
            raise InvalidInputError(await self._materialize_failure_message(code))
        logger.info(
            "Test case pool materialized",
            extra={"service_code": code, "count": len(created)},
        )
        return created

    async def attach_pool_to_scenario(
        self,
        scenario_id: int,
        *,
        per_step: list[list[int]],
    ) -> list[TestCase]:
        """
        Assign existing testcase rows to a scenario in order.

        ``per_step[i]`` aligns with the i-th step in ``scenario.steps_json``; each inner
        list is testcase ids attached in global execution order for that step.
        """
        await self._registry.ensure_default_runner_stub()
        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        raw_steps: list[Any] = loads_json(scenario.steps_json, [])
        if len(per_step) != len(raw_steps):
            raise InvalidInputError(
                f"per_step 길이({len(per_step)})가 시나리오 스텝 수({len(raw_steps)})와 같아야 합니다.",
            )
        global_idx = 0
        touched: list[TestCase] = []
        for ids in per_step:
            for tid in ids:
                tc = await self._metadata.get_testcase_by_id(int(tid))
                if tc is None:
                    raise EntityNotFoundError("TestCase", int(tid))
                updated = await self._metadata.update_testcase_fields(
                    int(tid),
                    scenario_id=scenario_id,
                    step_index=global_idx,
                )
                if updated is None:
                    raise EntityNotFoundError("TestCase", int(tid))
                touched.append(updated)
                global_idx += 1
        logger.info(
            "Test cases attached to scenario",
            extra={"scenario_id": scenario_id, "count": len(touched)},
        )
        return touched

    async def _generate_from_yaml_for_scenario(
        self, scenario_id: int, *, instruction: str | None
    ) -> list[TestCase]:
        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        raw_steps: list[Any] = loads_json(scenario.steps_json, [])
        if not raw_steps:
            raise InvalidInputError("시나리오에 단계(서비스)가 없습니다.")

        service_codes: list[str] = []
        for row in raw_steps:
            if not isinstance(row, dict):
                continue
            sc = self._extract_service_code(row)
            if sc:
                service_codes.append(sc)

        if not service_codes:
            raise InvalidInputError("서비스 코드 시퀀스를 찾을 수 없습니다.")

        await self._metadata.delete_testcases_for_scenario(scenario_id)
        created: list[TestCase] = []
        step_index = 0
        for code in service_codes:
            batch, step_index = await self._append_cases_for_service(
                service_code=code,
                scenario_id=scenario_id,
                instruction=instruction,
                step_index_start=step_index,
            )
            created.extend(batch)

        if not created:
            raise InvalidInputError("YAML 규칙을 읽지 못해 테스트 케이스를 만들 수 없습니다.")
        return created

    async def generate_all_for_scenario(
        self, scenario_id: int, *, instruction: str | None = None
    ) -> list[TestCase]:
        """Replace and recreate HTTP test cases from scenario steps (template-based)."""
        await self._registry.ensure_default_runner_stub()
        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        raw_steps: list[Any] = loads_json(scenario.steps_json, [])
        if not raw_steps:
            raise InvalidInputError("시나리오에 단계가 없습니다. 먼저 시나리오를 생성하세요.")

        if any(
            isinstance(r, dict) and self._extract_service_code(r)
            for r in raw_steps
        ):
            return await self._generate_from_yaml_for_scenario(
                scenario_id, instruction=instruction
            )

        await self._metadata.delete_testcases_for_scenario(scenario_id)
        created: list[TestCase] = []
        for idx, row in enumerate(raw_steps):
            if not isinstance(row, dict):
                continue
            action = str(row.get("action", f"Step {idx + 1}"))
            result = str(row.get("result", "success"))
            tpl = template_for_step_action(action, result)
            tc = await self._metadata.create_testcase(
                name=tpl["name"],
                steps=None,
                scenario_id=scenario_id,
                http_method=tpl["method"],
                endpoint=tpl["endpoint"],
                request_body_json=dumps_json(tpl["request_body"]),
                expected_status=tpl["expected_status"],
                expected_body_json=dumps_json(tpl["expected_body"]),
                step_index=idx,
            )
            created.append(tc)
        if not created:
            raise InvalidInputError("유효한 시나리오 단계가 없어 테스트 케이스를 만들 수 없습니다.")
        logger.info(
            "Test cases materialized",
            extra={"scenario_id": scenario_id, "count": len(created)},
        )
        return created

    async def list_for_scenario(self, scenario_id: int) -> list[TestCase]:
        """Return ordered test cases for a scenario."""
        if await self._metadata.get_scenario_by_id(scenario_id) is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        return await self._metadata.list_testcases_for_scenario(scenario_id)

    async def list_by_service_code(
        self, service_code: str, *, limit: int = 200
    ) -> list[TestCase]:
        """List materialized test cases for one CBS service code (SRVC_CD)."""
        code = (service_code or "").strip()
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        return await self._metadata.list_testcases_for_service_code(code, limit=limit)

    async def get_testcase(self, testcase_id: int) -> TestCase:
        """Load one test case."""
        entity = await self._metadata.get_testcase_by_id(testcase_id)
        if entity is None:
            raise EntityNotFoundError("TestCase", testcase_id)
        return entity

    async def patch_testcase(
        self,
        testcase_id: int,
        *,
        name: str | None,
        method: str | None,
        endpoint: str | None,
        request_body: dict[str, Any] | None,
        expected_status: int | None,
        expected_body: dict[str, Any] | None,
        step_index: int | None,
    ) -> TestCase:
        """Apply partial updates."""
        entity = await self._metadata.update_testcase_fields(
            testcase_id,
            name=name,
            http_method=method,
            endpoint=endpoint,
            request_body_json=dumps_json(request_body) if request_body is not None else None,
            expected_status=expected_status,
            expected_body_json=dumps_json(expected_body) if expected_body is not None else None,
            step_index=step_index,
        )
        if entity is None:
            raise EntityNotFoundError("TestCase", testcase_id)
        logger.info("Test case updated", extra={"testcase_id": testcase_id})
        return entity

    def build_postman_collection(self, testcase: TestCase) -> dict[str, Any]:
        """Build a Postman Collection v2.1 JSON document for one test case."""
        body_raw = loads_json(testcase.request_body_json, {})
        return {
            "info": {
                "name": f"FinTest — {testcase.name}",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
            },
            "item": [
                {
                    "name": testcase.name,
                    "request": {
                        "method": testcase.http_method or "GET",
                        "header": [{"key": "Content-Type", "value": "application/json"}],
                        "body": {
                            "mode": "raw",
                            "raw": dumps_json(body_raw),
                        },
                        "url": "{{baseUrl}}" + (testcase.endpoint or "/"),
                    },
                },
            ],
        }

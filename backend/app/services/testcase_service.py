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
from app.rules_yaml.loader import load_service_rules
from app.repositories.service_rules_repo import ServiceRulesRepository
from app.utils.helpers import build_placeholder_body
from app.utils.json_text import dumps_json, loads_json

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
        """Try to extract service_code from step row."""
        reason = str(row.get("reason") or "")
        # expected pattern: "code=PY016 | ..."
        if "code=" in reason:
            after = reason.split("code=", 1)[1]
            code = after.split("|", 1)[0].strip()
            if code:
                return code
        # fallback: allow action like "PY016 — ..."
        action = str(row.get("action") or "").strip()
        if len(action) >= 5 and action[:5].isalnum():
            return None
        return None

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
            code = self._extract_service_code(row)
            if code:
                service_codes.append(code)

        if not service_codes:
            raise InvalidInputError("서비스 코드 시퀀스를 찾을 수 없습니다.")

        await self._metadata.delete_testcases_for_scenario(scenario_id)
        created: list[TestCase] = []
        step_index = 0
        for code in service_codes:
            active_bundle_id: int | None = None
            bundle = None
            if self._service_rules_repo is not None:
                # DB-primary: use active bundle when present.
                db_bundle = await self._service_rules_repo.get_active_bundle(code)
                if db_bundle is not None:
                    active_bundle_id = db_bundle.id
                    # Keep the existing loader shape by parsing rules_json.
                    try:
                        parsed = json.loads(db_bundle.rules_json or "{}")
                    except Exception:  # noqa: BLE001
                        parsed = {}
                    rules = parsed.get("rules") or []
                    if isinstance(rules, list):
                        bundle = type(
                            "TmpBundle",
                            (),
                            {
                                "service_code": db_bundle.service_code,
                                "service_name": db_bundle.service_name_snapshot,
                                "source_version": db_bundle.source_version,
                                "rules": [r for r in rules if isinstance(r, dict)],
                            },
                        )()

            if bundle is None:
                # Fallback to file-based loader when DB has no active bundle.
                bundle = load_service_rules(code)
                if bundle is None:
                    continue
            svc_meta = await self._cbs_catalog.get_by_service_code(code)
            method = svc_meta.http_method if svc_meta else "POST"
            endpoint = svc_meta.uri if svc_meta else f"/services/{code}"

            for rule_idx, rule in enumerate(bundle.rules):
                rule_id = str(rule.get("rule_id") or f"{code}-RULE-{rule_idx+1:03d}")
                desc = str(rule.get("description") or "")
                expect = rule.get("expect") or {}
                if not isinstance(expect, dict):
                    expect = {}
                minimal_input = rule.get("minimal_input") or {}
                if not isinstance(minimal_input, dict):
                    minimal_input = {}

                expected_status = int(expect.get("http_status") or 200)
                expected_body: dict[str, Any] = {"outcome": expect.get("outcome")}
                if "error_code" in expect:
                    expected_body["error_code"] = expect.get("error_code")
                if "error_args" in expect:
                    expected_body["error_args"] = expect.get("error_args")

                name = f"{code} {rule_id} {desc}".strip()
                if instruction and instruction.strip():
                    name = f"{name} ({instruction.strip()})"
                tc = await self._metadata.create_testcase(
                    name=name,
                    steps=None,
                    scenario_id=scenario_id,
                    http_method=method,
                    endpoint=endpoint,
                    request_body_json=dumps_json(minimal_input),
                    expected_status=expected_status,
                    expected_body_json=dumps_json(expected_body),
                    step_index=step_index,
                    rule_bundle_id=active_bundle_id,
                )
                created.append(tc)
                step_index += 1

        if not created:
            raise InvalidInputError("YAML 규칙을 읽지 못해 테스트 케이스를 만들 수 없습니다.")
        return created

    async def generate_testcase(
        self,
        *,
        name: str,
        scenario_id: int | None,
        objective: str | None,
    ) -> TestCase:
        """Legacy single test case creation."""
        await self._registry.ensure_default_runner_stub()
        if scenario_id is not None:
            scenario = await self._metadata.get_scenario_by_id(scenario_id)
            if scenario is None:
                raise EntityNotFoundError("Scenario", scenario_id)
        seed = objective.strip() if objective else name
        steps = build_placeholder_body("testcase", seed)
        entity = await self._metadata.create_testcase(
            name=name,
            steps=steps,
            scenario_id=scenario_id,
        )
        logger.info(
            "Test case generated",
            extra={"testcase_id": entity.id, "testcase_name": name},
        )
        return entity

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

        # If steps look like a service-sequence (reason contains code=...), prefer YAML generation.
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

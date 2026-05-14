"""Business logic for scenario lifecycle."""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from typing import Any

from app.core.exceptions import EntityNotFoundError
from app.core.logger import get_logger
from app.domain.rules.death_rule import DeathInheritanceRule
from app.domain.rules.engine import ScenarioRuleEngine
from app.domain.scenario_intent import (
    EntityType,
    IntentType,
    ScenarioIntent,
    ScenarioIntentStep,
    TestType,
)
from app.integrations.llm_client import LlmClient
from app.models.scenario import Scenario
from app.repositories.cbs_service_catalog_repo import (
    CbsServiceCatalogRepository,
    CbsServiceRecord,
)
from app.repositories.metadata_repo import MetadataRepository
from app.repositories.service_registry_repo import ServiceRegistryRepository
from app.services.scenario_step_builder import build_steps_from_prompt, refine_steps_with_instruction
from app.utils.helpers import build_placeholder_body
from app.utils.json_text import dumps_json, loads_json

logger = get_logger(__name__)


@dataclass(slots=True)
class _MappedStep:
    """Internal mapped step containing intent + selected service."""

    intent: ScenarioIntentStep
    service: CbsServiceRecord | None


class ScenarioService:
    """Coordinates scenario generation and persistence."""

    def __init__(
        self,
        *,
        metadata_repo: MetadataRepository,
        registry_repo: ServiceRegistryRepository,
        cbs_catalog_repo: CbsServiceCatalogRepository,
        llm_client: LlmClient | None,
    ) -> None:
        self._metadata = metadata_repo
        self._registry = registry_repo
        self._cbs_catalog = cbs_catalog_repo
        self._llm = llm_client
        self._rule_engine = ScenarioRuleEngine()
        self._rule_engine.register_rule(DeathInheritanceRule())

    async def generate_scenario(self, *, title: str, prompt: str | None) -> Scenario:
        """Legacy endpoint path: preserve interface, run new pipeline."""
        p = (prompt or title).strip()
        t = (title or p or "시나리오")[:255]
        return await self._generate_and_store(prompt=p, title=t)

    async def create_from_prompt_v1(self, *, prompt: str, title: str | None) -> Scenario:
        """Create scenario from prompt via typed intent pipeline."""
        p = prompt.strip()
        t = (title or p or "시나리오")[:255]
        return await self._generate_and_store(prompt=p, title=t)

    async def _generate_and_store(self, *, prompt: str, title: str) -> Scenario:
        await self._registry.ensure_default_runner_stub()
        logger.info(
            "[pipeline:start] prompt=%r title=%r",
            prompt,
            title,
        )
        intent = await self._generate_intent_with_llm(prompt)
        logger.info(
            "[pipeline:intent] scenario_id=%s entities=%s events=%s step_count=%d",
            intent.scenario_id,
            intent.entities,
            intent.events,
            len(intent.step_intents),
        )
        ruled_steps = self._apply_rules(intent)
        logger.info(
            "[pipeline:rules] before=%d after=%d orders=%s",
            len(intent.step_intents),
            len(ruled_steps),
            [s.order for s in ruled_steps],
        )
        mapped = await self._map_services(ruled_steps)
        logger.info(
            "[pipeline:mapping] mapped=%d unmapped=%d",
            sum(1 for m in mapped if m.service is not None),
            sum(1 for m in mapped if m.service is None),
        )
        final_steps = self._build_final_steps(mapped)
        logger.info(
            "[pipeline:final] final_steps=%d actions=%s",
            len(final_steps),
            [s.get("action") for s in final_steps],
        )
        content = self._build_content_snapshot(mapped)
        entity = await self._metadata.create_scenario(
            title=title,
            description=None,
            content=content,
            prompt=prompt,
            steps_json=dumps_json(final_steps),
            is_saved=False,
        )
        logger.info(
            "Scenario created (typed pipeline)",
            extra={"scenario_id": entity.id, "steps": len(final_steps)},
        )
        logger.info("[pipeline:end] scenario_db_id=%s", entity.id)
        return entity

    async def _generate_intent_with_llm(self, prompt: str) -> ScenarioIntent:
        """Generate typed intent from LLM JSON output."""
        fallback = await self._build_fallback_intent(prompt)
        if self._llm is None:
            logger.info("[intent] llm_disabled_or_missing_key -> fallback_intent")
            return fallback
        system_prompt = (
            "You are a financial QA planner. Output ONLY JSON with exact schema:\n"
            "{"
            '"scenario_id": "str", "entities": ["str"], "events": ["str"], '
            '"primary_goal": "str", "expected_error": "str|null", '
            '"alternative_flow": "str|null", "step_intents": ['
            '{"step_id":"str","order":1,"intent_type":"CUSTOMER_NEW|ACCOUNT_OPEN|CUSTOMER_DEATH_REGISTER|ACCOUNT_CLOSE|ACCOUNT_INHERIT_CLOSE|GENERIC",'
            '"entity":"CUSTOMER|TERM_DEPOSIT|ACCOUNT|BENEFICIARY|GENERIC",'
            '"action":"str","context":{},"test_type":"POSITIVE|NEGATIVE|ALTERNATIVE"}'
            "]}"
        )
        example = {
            "scenario_id": "scenario_demo_001",
            "entities": ["CUSTOMER", "TERM_DEPOSIT"],
            "events": ["CUSTOMER_DEATH"],
            "primary_goal": "TERM_DEPOSIT_CLOSE",
            "expected_error": "CLOSE_NOT_ALLOWED_FOR_DEAD_CUSTOMER",
            "alternative_flow": "ACCOUNT_INHERIT_CLOSE",
            "step_intents": [
                {
                    "step_id": "s1",
                    "order": 1,
                    "intent_type": "CUSTOMER_NEW",
                    "entity": "CUSTOMER",
                    "action": "고객신규",
                    "context": {},
                    "test_type": "POSITIVE",
                }
            ],
        }
        user_prompt = (
            f"User request:\n{prompt}\n\n"
            "Example JSON format:\n"
            f"{json.dumps(example, ensure_ascii=False)}"
        )
        try:
            logger.info("[intent] llm_request_started prompt_len=%d", len(prompt))
            raw = await self._llm.complete_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug("LLM intent raw response: %s", raw[:4000])
            parsed = ScenarioIntent.model_validate_json(raw)
            logger.info(
                "[intent] llm_parse_success scenario_id=%s step_count=%d",
                parsed.scenario_id,
                len(parsed.step_intents),
            )
            return parsed
        except Exception as exc:
            logger.warning("[intent] llm_parse_failed -> fallback_intent error=%s", exc)
            return fallback

    def _infer_entity(self, row: CbsServiceRecord) -> EntityType:
        blob = f"{row.service_name} {row.operation_name} {row.uri}".lower()
        if any(k in blob for k in ("customer", "고객")):
            return EntityType.CUSTOMER
        if any(k in blob for k in ("deposit", "예금", "term")):
            return EntityType.TERM_DEPOSIT
        if any(k in blob for k in ("account", "계좌")):
            return EntityType.ACCOUNT
        return EntityType.GENERIC

    def _infer_intent_type(self, row: CbsServiceRecord, prompt: str) -> IntentType:
        blob = f"{row.service_name} {row.operation_name} {row.uri}".lower()
        p = prompt.lower()
        if any(k in blob for k in ("death", "사망")):
            return IntentType.CUSTOMER_DEATH_REGISTER
        if any(k in blob for k in ("inherit", "상속")):
            return IntentType.ACCOUNT_INHERIT_CLOSE
        if any(k in blob for k in ("close", "해지", "cancel", "terminate")):
            return IntentType.ACCOUNT_CLOSE
        if any(k in blob for k in ("open", "new", "register", "신규", "생성", "create")):
            if self._infer_entity(row) == EntityType.CUSTOMER:
                return IntentType.CUSTOMER_NEW
            return IntentType.ACCOUNT_OPEN
        if any(k in p for k in ("해지", "close", "cancel")):
            return IntentType.ACCOUNT_CLOSE
        return IntentType.GENERIC

    async def _build_fallback_intent(self, prompt: str) -> ScenarioIntent:
        """
        Deterministic fallback intent based on CSV retrieval (no hardcoded flow).

        It derives step intents from service metadata so the pipeline remains data-driven.
        """
        rows = await self._cbs_catalog.search_by_prompt(prompt, limit=6)
        logger.info(
            "[fallback] csv_candidates=%d prompt=%r",
            len(rows),
            prompt,
        )
        p = prompt.lower()
        wants_negative = any(k in p for k in ("error", "에러", "실패", "fail", "불가"))
        steps: list[ScenarioIntentStep] = []
        entities: set[str] = set()
        events: set[str] = set()
        for idx, row in enumerate(rows, start=1):
            intent_type = self._infer_intent_type(row, prompt)
            entity = self._infer_entity(row)
            entities.add(entity.value)
            if intent_type == IntentType.CUSTOMER_DEATH_REGISTER:
                events.add("CUSTOMER_DEATH")
            test_type = TestType.POSITIVE
            if wants_negative and intent_type == IntentType.ACCOUNT_CLOSE:
                test_type = TestType.NEGATIVE
            if intent_type == IntentType.ACCOUNT_INHERIT_CLOSE:
                test_type = TestType.ALTERNATIVE
            steps.append(
                ScenarioIntentStep(
                    step_id=f"fb_{idx}_{row.service_code or uuid.uuid4().hex[:4]}",
                    order=idx,
                    intent_type=intent_type,
                    entity=entity,
                    action=row.service_name or row.operation_name or row.service_code,
                    context={
                        "service_code": row.service_code,
                        "uri": row.uri,
                        "method": row.http_method,
                    },
                    test_type=test_type,
                )
            )
        if not steps:
            steps = [
                ScenarioIntentStep(
                    step_id="fb_1_generic",
                    order=1,
                    intent_type=IntentType.GENERIC,
                    entity=EntityType.GENERIC,
                    action=prompt[:120] or "generic_scenario_step",
                    context={},
                    test_type=TestType.POSITIVE,
                )
            ]
            entities.add(EntityType.GENERIC.value)
        logger.info(
            "[fallback] built_intent steps=%d entities=%s events=%s",
            len(steps),
            sorted(entities),
            sorted(events),
        )
        return ScenarioIntent(
            scenario_id=f"fallback_{uuid.uuid4().hex[:10]}",
            entities=sorted(entities),
            events=sorted(events),
            primary_goal=prompt[:255] or "SCENARIO_GENERATION",
            expected_error="BUSINESS_RULE_VIOLATION" if wants_negative else None,
            alternative_flow="ACCOUNT_INHERIT_CLOSE" if "CUSTOMER_DEATH" in events else None,
            step_intents=steps,
        )

    def _apply_rules(self, intent: ScenarioIntent) -> list[ScenarioIntentStep]:
        """Apply registered rules sequentially."""
        logger.info(
            "[rules] applying rule_engine rules=%d",
            len(getattr(self._rule_engine, "_rules", [])),
        )
        out = self._rule_engine.apply_all(intent.step_intents)
        logger.info(
            "[rules] applied step_ids=%s",
            [s.step_id for s in out],
        )
        return out

    async def _map_services(self, steps: list[ScenarioIntentStep]) -> list[_MappedStep]:
        """Resolve each intent step to best-matching service metadata."""
        out: list[_MappedStep] = []
        for step in sorted(steps, key=lambda s: s.order):
            query = f"{step.entity.value} {step.action} {step.intent_type.value}"
            candidates = await self._cbs_catalog.search_by_prompt(query, limit=5)
            chosen = candidates[0] if candidates else None
            logger.info(
                "[mapping:step] step_id=%s order=%d query=%r candidates=%d chosen=%s",
                step.step_id,
                step.order,
                query,
                len(candidates),
                chosen.service_code if chosen else None,
            )
            out.append(_MappedStep(intent=step, service=chosen))
        return out

    @staticmethod
    def _result_from_test_type(test_type: TestType) -> str:
        if test_type == TestType.NEGATIVE:
            return "error"
        return "success"

    def _build_final_steps(self, mapped_steps: list[_MappedStep]) -> list[dict[str, Any]]:
        """Convert mapped steps to existing UI step format."""
        out: list[dict[str, Any]] = []
        for idx, item in enumerate(mapped_steps, start=1):
            service_code = item.service.service_code if item.service else item.intent.intent_type.value
            service_name = item.service.service_name if item.service else item.intent.action
            method = item.service.http_method if item.service else "N/A"
            uri = item.service.uri if item.service else "unmapped"
            out.append(
                {
                    "id": f"step_{idx}_{uuid.uuid4().hex[:6]}",
                    "number": idx,
                    # UI 표시용: 서비스명(기존 service_code 대신).
                    "action": service_name,
                    "result": self._result_from_test_type(item.intent.test_type),
                    # 디버깅/추적용: code도 reason에 같이 남김.
                    # 화면에서는 action(h4)이 가장 크게 보이므로 reason에는 코드가 먼저 오게 포맷한다.
                    "reason": f"code={service_code} | {method} {uri} | service={service_name} | intent={item.intent.action}",
                }
            )
            logger.info(
                "[final:step] idx=%d action=%s result=%s mapped=%s",
                idx,
                service_code,
                out[-1]["result"],
                item.service is not None,
            )
        return out

    def _build_content_snapshot(self, mapped_steps: list[_MappedStep]) -> str:
        lines: list[str] = []
        for item in mapped_steps:
            if item.service is None:
                lines.append(f"UNMAPPED | {item.intent.action}")
            else:
                lines.append(
                    f"{item.service.http_method} {item.service.uri} | {item.service.service_code}"
                )
        return "\n".join(lines) if lines else build_placeholder_body("scenario", "empty")

    async def get_scenario(self, scenario_id: int) -> Scenario:
        entity = await self._metadata.get_scenario_by_id(scenario_id)
        if entity is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        return entity

    async def list_scenarios_page(
        self,
        *,
        saved_only: bool | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Scenario], int]:
        return await self._metadata.list_scenarios(
            saved_only=saved_only,
            limit=limit,
            offset=offset,
        )

    async def patch_scenario(
        self,
        scenario_id: int,
        *,
        title: str | None,
        prompt: str | None,
        steps: list[dict[str, Any]] | None,
    ) -> Scenario:
        steps_json = dumps_json(steps) if steps is not None else None
        entity = await self._metadata.update_scenario_fields(
            scenario_id,
            title=title,
            prompt=prompt,
            steps_json=steps_json,
        )
        if entity is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        return entity

    async def refine_with_instruction(
        self,
        scenario_id: int,
        *,
        instruction: str,
    ) -> Scenario:
        current = await self.get_scenario(scenario_id)
        current_steps: list[dict[str, Any]] = loads_json(current.steps_json, [])
        merged = refine_steps_with_instruction(current_steps, instruction)
        entity = await self._metadata.update_scenario_fields(
            scenario_id,
            steps_json=dumps_json(merged),
        )
        if entity is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        return entity

    async def mark_saved(self, scenario_id: int, *, saved: bool) -> Scenario:
        entity = await self._metadata.update_scenario_fields(
            scenario_id,
            is_saved=saved,
        )
        if entity is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        return entity
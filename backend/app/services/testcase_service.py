"""Business logic for test case lifecycle."""

from __future__ import annotations

import json
from typing import Any

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.core.logger import get_logger
from app.models.fnx_testcase import FnxTestcase
from app.repositories.cbs_service_catalog_repo import CbsServiceCatalogRepository
from app.repositories.metadata_repo import MetadataRepository
from app.repositories.service_registry_repo import ServiceRegistryRepository
from app.repositories.service_rules_repo import ServiceRulesRepository
from app.repositories.fnx_rule_case_repo import FnxRuleCaseRepository
from app.repositories.fnx_testcase_repo import FnxTestcaseRepository
from app.rules_yaml.loader import load_service_rules
from app.schemas.testcase_schema import TestCaseRefV1
from app.utils.json_text import dumps_json, loads_json
from app.utils.scenario_steps_document import (
    dump_steps_document,
    parse_steps_document,
    parse_steps_list,
)
from app.utils.testcase_display_name import build_materialized_testcase_name
from app.domain.yaml_rules_order import sort_rules_normal_then_error

logger = get_logger(__name__)


class TestCaseService:
    """Coordinates test case generation and validation (fnx_testcase only)."""

    def __init__(
        self,
        *,
        metadata_repo: MetadataRepository,
        registry_repo: ServiceRegistryRepository,
        cbs_catalog_repo: CbsServiceCatalogRepository,
        service_rules_repo: ServiceRulesRepository | None = None,
        case_repo: FnxRuleCaseRepository | None = None,
        tc_repo: FnxTestcaseRepository | None = None,
    ) -> None:
        """Construct the service with its data dependencies."""
        self._metadata = metadata_repo
        self._registry = registry_repo
        self._cbs_catalog = cbs_catalog_repo
        self._service_rules_repo = service_rules_repo
        self._case_repo = case_repo
        self._tc_repo = tc_repo

    def _require_tc_repo(self) -> FnxTestcaseRepository:
        """Return the natural-key testcase repository or raise if not wired."""
        if self._tc_repo is None:
            raise InvalidInputError("FnxTestcaseRepository가 설정되지 않았습니다.")
        return self._tc_repo

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
                    f"{code}: 적용된 규칙 YAML은 있으나 규칙이 비어 있습니다. "
                    "규칙/메타 관리에서 YAML을 수정한 뒤 적용하세요."
                )
            current = await self._service_rules_repo.get_current(code)
            if current is not None and current.has_draft and not current.has_applied:
                return (
                    f"{code}: 작업본만 있고 적용된 규칙이 없습니다. "
                    "규칙/메타 관리에서 「적용」한 뒤 다시 「테스트케이스 생성」을 실행하세요."
                )
            history = await self._service_rules_repo.list_versions(code)
            with_rules = [
                h for h in history if self._rule_count_from_json(h.rules_json) > 0
            ]
            if with_rules and active is None:
                return (
                    f"{code}: YAML 이력은 있으나 적용된 현재본이 없습니다. "
                    "규칙/메타 관리에서 작업본을 적용하거나 이력에서 복원한 뒤 "
                    "다시 「테스트케이스 생성」을 실행하세요."
                )
            if history and active is None:
                return (
                    f"{code}: 규칙 이력은 있으나 적용된 현재본이 없습니다. "
                    "규칙/메타 관리에서 규칙을 적용하세요."
                )
        file_bundle = load_service_rules(code)
        if file_bundle is None:
            return (
                f"{code}: 등록된 YAML 규칙이 없습니다. "
                "규칙/메타 관리에서 YAML을 등록·적용하거나, "
                f"rules_yaml/{code}.yaml 파일을 추가하세요."
            )
        if not file_bundle.rules:
            return (
                f"{code}: rules_yaml/{code}.yaml 파일은 있으나 rules 항목이 비어 있습니다."
            )
        return (
            f"{code}: 테스트케이스를 생성할 수 있는 적용된 YAML 규칙이 없습니다."
        )

    async def _load_rule_bundle(
        self,
        code: str,
        *,
        bundle_id: int | None = None,
        yaml_text: str | None = None,
    ) -> tuple[Any | None, int | None]:
        """Return (bundle_like, rule_history_id) from yaml_text, DB row, active, or file."""
        if yaml_text is not None and str(yaml_text).strip():
            from app.services.service_rules_service import validate_and_prepare_yaml

            try:
                _canonical, parsed = validate_and_prepare_yaml(str(yaml_text))
            except InvalidInputError:
                raise
            except Exception as exc:  # noqa: BLE001
                raise InvalidInputError(f"YAML 파싱 실패: {exc}") from exc
            rules = parsed.get("rules") or []
            if not isinstance(rules, list):
                rules = []
            tmp = type(
                "TmpBundle",
                (),
                {
                    "service_code": code,
                    "service_name": code,
                    "source_version": None,
                    "rules": [r for r in rules if isinstance(r, dict)],
                },
            )()
            return (tmp, None)

        if self._service_rules_repo is None:
            bundle = load_service_rules(code)
            return (bundle, None)

        db_bundle = None
        if bundle_id is not None:
            db_bundle = await self._service_rules_repo.get_current_by_id(bundle_id)
            if db_bundle is not None and db_bundle.service_code != code:
                raise InvalidInputError(
                    "bundle_id가 service_code와 일치하지 않습니다.",
                )
        if db_bundle is None:
            db_bundle = await self._service_rules_repo.get_active_bundle(code)

        if db_bundle is not None:
            history = await self._service_rules_repo.find_history_by_checksum(
                service_code=code, checksum=db_bundle.checksum or ""
            )
            history_id = history.id if history is not None else None
            # Prefer working draft so editor macros are included before activate.
            rules_raw = (
                db_bundle.draft_rules_json
                if db_bundle.has_draft
                and (db_bundle.draft_rules_json or "").strip()
                else db_bundle.rules_json
            )
            try:
                parsed = json.loads(rules_raw or "{}")
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
                return (tmp, history_id)
        bundle = load_service_rules(code)
        return (bundle, None)

    @staticmethod
    def _fields_from_rule(rule: dict[str, Any]) -> tuple[dict[str, Any], int | None, dict[str, Any]]:
        """Return (rule_input, expected_status, expected_body) for one YAML rule."""
        expect = rule.get("expect") or {}
        if not isinstance(expect, dict):
            expect = {}
        rule_input = rule.get("input") or rule.get("minimal_input") or {}
        if not isinstance(rule_input, dict):
            rule_input = {}

        raw_status = expect.get("http_status")
        expected_status = None if raw_status is None or raw_status == "" else int(raw_status)
        expected_body: dict[str, Any] = {"outcome": expect.get("outcome")}
        if "error_code" in expect:
            expected_body["error_code"] = expect.get("error_code")
        if "error_args" in expect:
            expected_body["error_args"] = expect.get("error_args")
        if "validation_target" in expect:
            expected_body["validation_target"] = expect.get("validation_target")
        return rule_input, expected_status, expected_body

    async def _append_cases_for_service(
        self,
        *,
        service_code: str,
        instruction: str | None,
        bundle_id: int | None = None,
        yaml_text: str | None = None,
        inst_cd: str,
    ) -> list[FnxTestcase]:
        """Upsert one fnx_testcase pool row per rule case for ``service_code``."""
        from app.domain.inst_scope import require_inst_cd

        tc_repo = self._require_tc_repo()
        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code:
            return []
        bundle, _rule_history_id = await self._load_rule_bundle(
            code,
            bundle_id=bundle_id,
            yaml_text=yaml_text,
        )
        if bundle is None or not getattr(bundle, "rules", None):
            return []
        svc_meta = await self._cbs_catalog.get_by_service_code(code)
        method = svc_meta.http_method if svc_meta else "POST"
        endpoint = svc_meta.uri if svc_meta else f"/services/{code}"
        ordered_rules = sort_rules_normal_then_error(
            {"rules": [r for r in bundle.rules if isinstance(r, dict)]}
        )["rules"]
        case_map: dict[str, tuple[Any, Any]] = {}
        if self._case_repo is not None:
            try:
                case_map = await self._case_repo.map_case_ids_to_latest_hist(
                    code, inst_cd=inst
                )
            except Exception:  # noqa: BLE001
                logger.warning(
                    "Failed to load fnx_rule_case map for %s inst=%s",
                    code,
                    inst,
                    exc_info=True,
                )
                case_map = {}

        created: list[FnxTestcase] = []
        for rule_idx, rule in enumerate(ordered_rules):
            case_id = str(
                rule.get("case_id")
                or rule.get("rule_id")
                or f"{code}-CASE-{rule_idx + 1:03d}"
            )
            mapped = case_map.get(case_id)
            if mapped is None:
                logger.warning(
                    "Skipping rule case without fnx_rule_case mapping",
                    extra={"service_code": code, "case_id": case_id, "inst_cd": inst},
                )
                continue
            case_row, hist_row = mapped
            rule_svc_code = getattr(case_row, "svc_code", None) or code
            rule_case_id = getattr(case_row, "rule_case_id", None) or case_id
            rule_case_hist_version = (
                getattr(hist_row, "version", None) if hist_row else None
            )

            rule_input, expected_status, expected_body = self._fields_from_rule(rule)
            name = build_materialized_testcase_name(
                case_id=case_id,
                rule=rule,
                instruction=instruction,
            )
            row = await tc_repo.upsert(
                inst_cd=inst,
                svc_code=rule_svc_code,
                rule_case_id=rule_case_id,
                name=name,
                http_method=method,
                endpoint=endpoint,
                request_body_json=dumps_json(rule_input),
                expected_status=expected_status,
                expected_body_json=dumps_json(expected_body),
                rule_case_hist_version=rule_case_hist_version,
            )
            created.append(row)
        return created

    async def materialize_pool_for_service(
        self,
        service_code: str,
        *,
        instruction: str | None = None,
        replace_existing: bool = True,
        bundle_id: int | None = None,
        yaml_text: str | None = None,
        inst_cd: str,
    ) -> list[FnxTestcase]:
        """
        Create HTTP test cases for one service (no scenario), from YAML rules.

        Prefer ``yaml_text`` (editor contents), else ``bundle_id`` working draft /
        applied document, else active DB bundle / file YAML.
        """
        from app.domain.inst_scope import require_inst_cd

        tc_repo = self._require_tc_repo()
        await self._registry.ensure_default_runner_stub()
        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        if replace_existing:
            await tc_repo.delete_for_service(code, inst_cd=inst)
        created = await self._append_cases_for_service(
            service_code=code,
            instruction=instruction,
            bundle_id=bundle_id,
            yaml_text=yaml_text,
            inst_cd=inst,
        )
        if not created:
            raise InvalidInputError(await self._materialize_failure_message(code))
        logger.info(
            "Test case pool materialized",
            extra={"service_code": code, "inst_cd": inst, "count": len(created)},
        )
        return created

    async def materialize_one_case(
        self,
        service_code: str,
        case_id: str,
        *,
        instruction: str | None = None,
        bundle_id: int | None = None,
        yaml_text: str | None = None,
        inst_cd: str,
        require_applied: bool = False,
    ) -> FnxTestcase:
        """Upsert one pool test case for a single rule case_id (other TCs untouched)."""
        from app.domain.inst_scope import require_inst_cd
        from app.domain.rule_case_codec import (
            applied_rule_dict_from_row,
            draft_rule_dict_from_row,
        )

        tc_repo = self._require_tc_repo()
        await self._registry.ensure_default_runner_stub()
        code = (service_code or "").strip()
        cid = (case_id or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        if not cid:
            raise InvalidInputError("case_id가 필요합니다.")

        rule: dict[str, Any] | None = None
        if require_applied:
            if self._case_repo is None:
                raise InvalidInputError("규칙 케이스 저장소가 설정되지 않았습니다.")
            case_row = await self._case_repo.get_case_by_case_id(
                code, cid, inst_cd=inst
            )
            if case_row is None or not self._case_repo.is_case_applied(case_row):
                raise InvalidInputError(
                    f"{code}/{cid}: 확정(활성)된 케이스만 시나리오에 사용할 수 있습니다. "
                    "규칙 편집에서 확정한 뒤 다시 시도하세요."
                )
            rule = applied_rule_dict_from_row(case_row)
        else:
            bundle, _rule_history_id = await self._load_rule_bundle(
                code,
                bundle_id=bundle_id,
                yaml_text=yaml_text,
            )
            if bundle is not None and getattr(bundle, "rules", None):
                for candidate in bundle.rules:
                    if not isinstance(candidate, dict):
                        continue
                    rid = str(
                        candidate.get("case_id") or candidate.get("rule_id") or ""
                    ).strip()
                    if rid == cid:
                        rule = candidate
                        break

            if rule is None and self._case_repo is not None:
                case_row = await self._case_repo.get_case_by_case_id(
                    code, cid, inst_cd=inst
                )
                if case_row is not None:
                    rule = draft_rule_dict_from_row(
                        case_row
                    ) or applied_rule_dict_from_row(case_row)

        if rule is None:
            raise EntityNotFoundError("RuleCase", f"{code}/{cid}")

        svc_meta = await self._cbs_catalog.get_by_service_code(code)
        method = svc_meta.http_method if svc_meta else "POST"
        endpoint = svc_meta.uri if svc_meta else f"/services/{code}"

        rule_input, expected_status, expected_body = self._fields_from_rule(rule)
        name = build_materialized_testcase_name(
            case_id=cid,
            rule=rule,
            instruction=instruction,
        )

        rule_svc_code = code
        rule_case_id = cid
        rule_case_hist_version: int | None = None
        if self._case_repo is not None:
            try:
                case_map = await self._case_repo.map_case_ids_to_latest_hist(
                    code, inst_cd=inst
                )
                mapped = case_map.get(cid)
                if mapped is not None:
                    case_row, hist_row = mapped
                    rule_svc_code = getattr(case_row, "svc_code", None) or code
                    rule_case_id = getattr(case_row, "rule_case_id", None) or cid
                    rule_case_hist_version = (
                        getattr(hist_row, "version", None) if hist_row else None
                    )
            except Exception:  # noqa: BLE001
                logger.warning(
                    "Failed to stamp hist for %s/%s inst=%s",
                    code,
                    cid,
                    inst,
                    exc_info=True,
                )

        row = await tc_repo.upsert(
            inst_cd=inst,
            svc_code=rule_svc_code,
            rule_case_id=rule_case_id,
            name=name,
            http_method=method,
            endpoint=endpoint,
            request_body_json=dumps_json(rule_input),
            expected_status=expected_status,
            expected_body_json=dumps_json(expected_body),
            rule_case_hist_version=rule_case_hist_version,
        )
        logger.info(
            "Test case upserted",
            extra={"service_code": code, "case_id": cid, "rule_case_id": row.rule_case_id},
        )
        return row

    async def attach_pool_to_scenario(
        self,
        scenario_id: int,
        *,
        per_step: list[list[TestCaseRefV1]],
        inst_cd: str,
    ) -> list[FnxTestcase]:
        """
        Write natural-key refs onto scenario steps (no clones) in scenario order.

        ``per_step[i]`` aligns with the i-th step in ``scenario.steps_json``; when a
        step has multiple refs, the first ref wins for that step's persisted link
        (every ref is still validated so the UI can surface bad selections).
        """
        from app.domain.inst_scope import require_inst_cd

        tc_repo = self._require_tc_repo()
        inst = require_inst_cd(inst_cd)
        await self._registry.ensure_default_runner_stub()
        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        raw_steps, postman_cfg = parse_steps_document(scenario.steps_json)
        if len(per_step) != len(raw_steps):
            raise InvalidInputError(
                f"per_step 길이({len(per_step)})가 시나리오 스텝 수({len(raw_steps)})와 같아야 합니다.",
            )

        resolved: list[FnxTestcase] = []
        updated_steps: list[Any] = []
        for step_i, step in enumerate(raw_steps):
            refs = per_step[step_i]
            row = dict(step) if isinstance(step, dict) else {}
            chosen: FnxTestcase | None = None
            for ref in refs:
                tc = await self.materialize_one_case(
                    ref.svc_code,
                    ref.rule_case_id,
                    inst_cd=inst,
                    require_applied=True,
                )
                body = loads_json(tc.request_body_json, {})
                if not isinstance(body, dict) or len(body) == 0:
                    raise InvalidInputError(
                        f"원본 Input이 비어 있습니다 (스텝 {step_i + 1}, "
                        f"{tc.svc_code}/{tc.rule_case_id}). YAML을 채운 뒤 확정하세요.",
                    )
                if chosen is None:
                    chosen = tc
            if chosen is not None:
                row["service_code"] = chosen.svc_code
                row["rule_case_id"] = chosen.rule_case_id
                resolved.append(chosen)
            updated_steps.append(row)

        steps_json = dump_steps_document(updated_steps, postman_cfg)
        await self._metadata.update_scenario_fields(scenario_id, steps_json=steps_json)
        logger.info(
            "Test cases attached to scenario",
            extra={"scenario_id": scenario_id, "count": len(resolved)},
        )
        return resolved

    async def _generate_from_yaml_for_scenario(
        self, scenario_id: int, *, instruction: str | None, inst_cd: str
    ) -> list[FnxTestcase]:
        from app.domain.inst_scope import require_inst_cd

        self._require_tc_repo()
        inst = require_inst_cd(inst_cd)
        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        raw_steps, postman_cfg = parse_steps_document(scenario.steps_json)
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

        pool_by_service: dict[str, list[FnxTestcase]] = {}
        for code in dict.fromkeys(service_codes):
            try:
                pool_by_service[code] = await self.materialize_pool_for_service(
                    code,
                    instruction=instruction,
                    replace_existing=True,
                    inst_cd=inst,
                )
            except InvalidInputError:
                pool_by_service[code] = []

        updated_steps: list[Any] = []
        for row in raw_steps:
            if not isinstance(row, dict):
                updated_steps.append(row)
                continue
            step = dict(row)
            code = self._extract_service_code(step)
            if code:
                step["service_code"] = code
                existing = step.get("rule_case_id")
                if not (isinstance(existing, str) and existing.strip()):
                    pool = pool_by_service.get(code) or []
                    if pool:
                        step["rule_case_id"] = pool[0].rule_case_id
            updated_steps.append(step)

        steps_json = dump_steps_document(updated_steps, postman_cfg)
        await self._metadata.update_scenario_fields(scenario_id, steps_json=steps_json)

        created = await self.list_for_scenario(scenario_id, inst_cd=inst)
        if not created:
            raise InvalidInputError("YAML 규칙을 읽지 못해 테스트 케이스를 만들 수 없습니다.")
        return created

    async def generate_all_for_scenario(
        self, scenario_id: int, *, instruction: str | None = None, inst_cd: str
    ) -> list[FnxTestcase]:
        """Replace and (re)link pool test cases from scenario steps (template-based)."""
        from app.domain.inst_scope import require_inst_cd

        inst = require_inst_cd(inst_cd)
        await self._registry.ensure_default_runner_stub()
        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        raw_steps = parse_steps_list(loads_json(scenario.steps_json, []))
        if not raw_steps:
            raise InvalidInputError("시나리오에 단계가 없습니다. 먼저 시나리오를 생성하세요.")

        if not any(
            isinstance(r, dict) and self._extract_service_code(r) for r in raw_steps
        ):
            raise InvalidInputError(
                "서비스 코드가 없는 시나리오 단계는 테스트 케이스를 생성할 수 없습니다. "
                "단계에 service_code를 지정하세요.",
            )
        return await self._generate_from_yaml_for_scenario(
            scenario_id, instruction=instruction, inst_cd=inst
        )

    async def list_for_scenario(
        self, scenario_id: int, *, inst_cd: str
    ) -> list[FnxTestcase]:
        """Return ordered test cases for a scenario (one per step with a link)."""
        from app.domain.inst_scope import require_inst_cd
        from app.services.scenario_testcase_loader import list_testcases_for_steps

        tc_repo = self._require_tc_repo()
        inst = require_inst_cd(inst_cd)
        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        return await list_testcases_for_steps(
            steps_json=scenario.steps_json, tc_repo=tc_repo, inst_cd=inst
        )

    async def list_by_service_code(
        self,
        service_code: str,
        *,
        inst_cd: str,
        limit: int = 200,
        scenario_eligible: bool = False,
    ) -> list[FnxTestcase]:
        """List pool test cases for one CBS service."""
        from app.domain.inst_scope import require_inst_cd

        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        if scenario_eligible:
            if self._case_repo is None:
                raise InvalidInputError("규칙 케이스 저장소가 설정되지 않았습니다.")
            rows: list[FnxTestcase] = []
            for case_row in await self._case_repo.list_applied_cases(
                code, inst_cd=inst
            ):
                rows.append(
                    await self.materialize_one_case(
                        code,
                        case_row.rule_case_id,
                        inst_cd=inst,
                        require_applied=True,
                    )
                )
            return rows[:limit] if limit is not None else rows

        tc_repo = self._require_tc_repo()
        rows = await tc_repo.list_for_service(code, inst_cd=inst)
        return rows[:limit] if limit is not None else rows

    async def get_testcase(
        self, inst_cd: str, svc_code: str, rule_case_id: str
    ) -> FnxTestcase:
        """Load one test case by natural key."""
        from app.domain.inst_scope import require_inst_cd

        tc_repo = self._require_tc_repo()
        inst = require_inst_cd(inst_cd)
        entity = await tc_repo.get(
            inst_cd=inst, svc_code=svc_code, rule_case_id=rule_case_id
        )
        if entity is None:
            raise EntityNotFoundError("TestCase", f"{svc_code}/{rule_case_id}")
        return entity

    async def patch_testcase(
        self,
        inst_cd: str,
        svc_code: str,
        rule_case_id: str,
        *,
        name: str | None,
        method: str | None,
        endpoint: str | None,
        request_body: dict[str, Any] | None,
        expected_status: int | None,
        expected_body: dict[str, Any] | None,
    ) -> FnxTestcase:
        """Apply partial updates by natural key."""
        from app.domain.inst_scope import require_inst_cd

        tc_repo = self._require_tc_repo()
        inst = require_inst_cd(inst_cd)
        existing = await tc_repo.get(
            inst_cd=inst, svc_code=svc_code, rule_case_id=rule_case_id
        )
        if existing is None:
            raise EntityNotFoundError("TestCase", f"{svc_code}/{rule_case_id}")

        updated = await tc_repo.upsert(
            inst_cd=inst,
            svc_code=svc_code,
            rule_case_id=rule_case_id,
            name=name if name is not None else existing.name,
            http_method=method if method is not None else existing.http_method,
            endpoint=endpoint if endpoint is not None else existing.endpoint,
            request_body_json=(
                dumps_json(request_body)
                if request_body is not None
                else existing.request_body_json
            ),
            expected_status=(
                expected_status if expected_status is not None else existing.expected_status
            ),
            expected_body_json=(
                dumps_json(expected_body)
                if expected_body is not None
                else existing.expected_body_json
            ),
            assertions_json=existing.assertions_json,
            rule_case_hist_version=existing.rule_case_hist_version,
            pool_sample_id=existing.pool_sample_id,
            updated_by=existing.updated_by,
            change_kind="patch",
        )
        logger.info(
            "Test case updated",
            extra={"svc_code": svc_code, "rule_case_id": rule_case_id},
        )
        return updated

    def build_postman_collection(
        self,
        testcase: FnxTestcase,
        *,
        request_body: dict[str, Any] | None = None,
        event_scripts: list[dict[str, Any]] | None = None,
        request_headers: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        """Build a Postman Collection v2.1 JSON document for one test case.

        Does not resolve Finix macros to concrete values — callers that need
        Postman ``{{var}}`` + pre-request seeding should rewrite first via
        ``rewrite_mapping_macros_for_postman``.
        """
        from app.domain.postman_bxm_system_header import build_postman_export_request_headers

        body_raw = request_body if request_body is not None else loads_json(
            testcase.request_body_json, {},
        )
        headers = (
            request_headers
            if request_headers is not None
            else build_postman_export_request_headers()
        )
        item: dict[str, Any] = {
            "name": testcase.name,
            "request": {
                "method": testcase.http_method or "GET",
                "header": headers,
                "body": {
                    "mode": "raw",
                    "raw": dumps_json(body_raw),
                },
                "url": "{{baseUrl}}" + (testcase.endpoint or "/"),
            },
        }
        if event_scripts:
            item["event"] = event_scripts
        return {
            "info": {
                "name": f"FinTest — {testcase.name}",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                "description": "Generated snapshot (not source of truth).",
            },
            "item": [item],
        }

    def build_postman_for_pool_testcases(
        self,
        testcases: list[FnxTestcase],
        *,
        collection_title: str,
        service_code_hint: str | None = None,
        postman_config: Any | None = None,
        request_bodies: dict[str, dict[str, Any]] | None = None,
        description: str | None = None,
    ) -> dict[str, Any]:
        """
        Export pool/standalone test cases with the same BXM header script,
        collection variables, and response tests as scenario Postman export.

        ``request_bodies`` (when given) is keyed by ``rule_case_id``.
        """
        from app.domain.postman_bxm_system_header import (
            bxm_item_srvc_cd_prerequest,
            bxm_prerequest_collection_event,
            build_postman_export_request_headers,
            service_code_for_testcase,
        )
        from app.domain.postman_chaining import merge_postman_events
        from app.domain.postman_collection_config import PostmanCollectionConfig
        from app.domain.postman_collection_variables import (
            build_postman_collection_variables,
        )
        from app.domain.postman_generator_scripts import (
            build_start_var_generator_exec_lines,
            merge_collection_prerequest_events,
        )
        from app.domain.postman_macro_export import (
            FinixMacroExportSpec,
            build_finix_macro_prerequest_exec_lines,
            collection_variables_for_macro_specs,
            rewrite_mapping_macros_for_postman,
        )

        if not testcases:
            raise InvalidInputError("내보낼 테스트케이스가 없습니다.")

        cfg = postman_config
        if cfg is not None and not isinstance(cfg, PostmanCollectionConfig):
            if isinstance(cfg, dict):
                cfg = PostmanCollectionConfig.model_validate(cfg)
            else:
                cfg = PostmanCollectionConfig()
        if cfg is None:
            cfg = PostmanCollectionConfig()

        request_headers = build_postman_export_request_headers()
        hint = (service_code_hint or "").strip() or None
        items: list[dict[str, Any]] = []
        macro_specs: list[FinixMacroExportSpec] = []

        for tc in testcases:
            override = (request_bodies or {}).get(tc.rule_case_id)
            if override is not None:
                body_src = override if isinstance(override, dict) else {}
            else:
                loaded = loads_json(tc.request_body_json, {})
                body_src = loaded if isinstance(loaded, dict) else {}
            body, specs = rewrite_mapping_macros_for_postman(body_src)
            macro_specs.extend(specs)

            exp_body = loads_json(tc.expected_body_json, {})
            if not isinstance(exp_body, dict):
                exp_body = {}

            events = merge_postman_events(
                extracts=[],
                injects=[],
                expected_status=tc.expected_status,
                expected_body=exp_body,
                testcase_name=tc.name or "",
            )
            svc_code = service_code_for_testcase(tc) or hint
            svc_pre = bxm_item_srvc_cd_prerequest(svc_code) if svc_code else None
            if svc_pre:
                events = [svc_pre, *events]

            col = self.build_postman_collection(
                tc,
                request_body=body if isinstance(body, dict) else {},
                event_scripts=events,
                request_headers=request_headers,
            )
            items.extend(col["item"])

        collection_variables = build_postman_collection_variables(
            cfg,
            runtime_var_names=[],
        )
        existing_keys = {row["key"] for row in collection_variables}
        for row in collection_variables_for_macro_specs(macro_specs):
            if row["key"] not in existing_keys:
                collection_variables.append(row)
                existing_keys.add(row["key"])

        gen_lines = build_start_var_generator_exec_lines(cfg, catalog=None)
        gen_event = (
            {
                "listen": "prerequest",
                "script": {"type": "text/javascript", "exec": gen_lines},
            }
            if gen_lines
            else None
        )
        macro_lines = build_finix_macro_prerequest_exec_lines(macro_specs)
        macro_event = (
            {
                "listen": "prerequest",
                "script": {"type": "text/javascript", "exec": macro_lines},
            }
            if macro_lines
            else None
        )
        payload: dict[str, Any] = {
            "info": {
                "name": collection_title,
                "schema": (
                    "https://schema.getpostman.com/json/collection/v2.1.0/"
                    "collection.json"
                ),
                "description": description
                or (
                    "Generated pool snapshot with BXM header script and "
                    "response tests (not source of truth)."
                ),
            },
            "item": items,
        }
        if collection_variables:
            payload["variable"] = collection_variables
        payload["event"] = merge_collection_prerequest_events(
            gen_event,
            macro_event,
            bxm_prerequest_collection_event(cfg),
        )
        return payload

    async def build_postman_for_testcase_export(
        self,
        inst_cd: str,
        svc_code: str,
        rule_case_id: str,
        *,
        mode: str = "template",
        scenario_id: int | None = None,
    ) -> dict[str, Any]:
        """Full Postman export for one pool/scenario test case."""
        entity = await self.get_testcase(inst_cd, svc_code, rule_case_id)
        request_bodies: dict[str, dict[str, Any]] | None = None
        if mode == "resolved" and scenario_id is not None:
            body = await self.get_resolved_request_body(
                scenario_id=scenario_id,
                svc_code=entity.svc_code,
                rule_case_id=entity.rule_case_id,
                inst_cd=inst_cd,
            )
            if isinstance(body, dict):
                request_bodies = {entity.rule_case_id: body}

        return self.build_postman_for_pool_testcases(
            [entity],
            collection_title=f"FinTest — {entity.name}",
            service_code_hint=entity.svc_code,
            request_bodies=request_bodies,
        )

    async def build_postman_for_service_export(
        self,
        service_code: str,
        *,
        inst_cd: str,
        limit: int = 500,
    ) -> dict[str, Any]:
        """Full Postman export for every pool test case under a service."""
        code = (service_code or "").strip()
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        rows = await self.list_by_service_code(code, inst_cd=inst_cd, limit=limit)
        if not rows:
            raise InvalidInputError(
                "이 서비스에 적재된 테스트케이스가 없습니다.",
            )
        rows = sorted(rows, key=lambda row: row.rule_case_id)
        return self.build_postman_for_pool_testcases(
            rows,
            collection_title=f"FinTest Service — {code}",
            service_code_hint=code,
            description=(
                f"Service pool export for {code}: BXM header script, "
                f"baseUrl variable, and per-request response tests."
            ),
        )

    async def build_postman_for_scenario(
        self,
        scenario_id: int,
        *,
        inst_cd: str,
        resolved: bool = True,
        native: bool = True,
        steps_json_override: str | None = None,
        generator_catalog: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Export all scenario test cases as one Postman collection."""
        from app.domain.inst_scope import require_inst_cd
        from app.domain.postman_bxm_system_header import (
            bxm_item_srvc_cd_prerequest,
            bxm_prerequest_collection_event,
            build_postman_export_request_headers,
            step_service_codes_from_steps,
        )
        from app.domain.postman_chaining import (
            build_postman_request_body,
            merge_postman_events,
        )
        from app.domain.postman_collection_description import (
            build_postman_collection_description,
        )
        from app.domain.postman_collection_variables import (
            build_postman_collection_variables,
            collect_runtime_var_names_from_bindings,
        )
        from app.domain.postman_generator_scripts import (
            build_start_var_generator_exec_lines,
            merge_collection_prerequest_events,
        )
        from app.domain.postman_macro_export import (
            FinixMacroExportSpec,
            build_finix_macro_prerequest_exec_lines,
            collection_variables_for_macro_specs,
            rewrite_mapping_macros_for_postman,
        )
        from app.services.execution_simulator import simulate_response
        from app.services.scenario_run_resolver import (
            bindings_by_logical_step,
            resolve_scenario_run,
        )

        inst = require_inst_cd(inst_cd)
        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        testcases = await self.list_for_scenario(scenario_id, inst_cd=inst)
        if not testcases:
            raise InvalidInputError("시나리오에 연결된 테스트 케이스가 없습니다.")

        steps_json = steps_json_override if steps_json_override is not None else scenario.steps_json
        _raw_steps, postman_config = parse_steps_document(steps_json)
        request_headers = build_postman_export_request_headers()
        step_service_codes = step_service_codes_from_steps(steps_json)
        catalog = generator_catalog

        use_native = native and resolved
        preview = None
        if resolved and not use_native:
            preview = resolve_scenario_run(
                testcases,
                steps_json=steps_json,
                simulate_response=simulate_response,
                generator_catalog=catalog,
            )
        elif resolved and use_native:
            preview = resolve_scenario_run(
                testcases,
                steps_json=steps_json,
                simulate_response=None,
                generator_catalog=catalog,
            )

        binding_map = bindings_by_logical_step(steps_json)
        collection_variables = build_postman_collection_variables(
            postman_config,
            runtime_var_names=collect_runtime_var_names_from_bindings(binding_map),
            catalog=catalog,
        )
        items: list[dict[str, Any]] = []
        macro_specs: list[FinixMacroExportSpec] = []
        for enum_idx, tc in enumerate(testcases):
            logical_step = enum_idx
            injects, extracts, overrides = binding_map.get(logical_step, ([], [], []))
            raw_body = loads_json(tc.request_body_json, {})
            template = raw_body if isinstance(raw_body, dict) else {}

            if use_native:
                body = build_postman_request_body(
                    template,
                    injects=injects,
                    overrides=overrides,
                )
            elif resolved and preview is not None:
                row = next(
                    (
                        r
                        for r in preview.steps
                        if r.svc_code == tc.svc_code and r.rule_case_id == tc.rule_case_id
                    ),
                    None,
                )
                body = (
                    row.resolved_request_body
                    if row is not None
                    else template
                )
            else:
                body = template

            if isinstance(body, dict):
                body, specs = rewrite_mapping_macros_for_postman(body)
                macro_specs.extend(specs)
            else:
                body = {}

            exp_body = loads_json(tc.expected_body_json, {})
            if not isinstance(exp_body, dict):
                exp_body = {}

            events = (
                merge_postman_events(
                    extracts=extracts,
                    injects=injects,
                    expected_status=tc.expected_status,
                    expected_body=exp_body,
                    testcase_name=tc.name or "",
                )
                if use_native
                else None
            )
            svc_code = step_service_codes.get(logical_step) or tc.svc_code
            svc_pre = bxm_item_srvc_cd_prerequest(svc_code) if svc_code else None
            if svc_pre:
                events = [svc_pre, *(events or [])]
            col = self.build_postman_collection(
                tc,
                request_body=body if isinstance(body, dict) else {},
                event_scripts=events,
                request_headers=request_headers,
            )
            items.extend(col["item"])

        existing_keys = {row["key"] for row in collection_variables}
        for row in collection_variables_for_macro_specs(macro_specs):
            if row["key"] not in existing_keys:
                collection_variables.append(row)
                existing_keys.add(row["key"])

        gen_lines = build_start_var_generator_exec_lines(
            postman_config,
            catalog=catalog,
        )
        gen_event = (
            {
                "listen": "prerequest",
                "script": {"type": "text/javascript", "exec": gen_lines},
            }
            if gen_lines
            else None
        )
        macro_lines = build_finix_macro_prerequest_exec_lines(macro_specs)
        macro_event = (
            {
                "listen": "prerequest",
                "script": {"type": "text/javascript", "exec": macro_lines},
            }
            if macro_lines
            else None
        )
        desc = build_postman_collection_description(
            title=scenario.title or "",
            prompt=scenario.prompt,
            testcases=testcases,
            binding_map=binding_map,
            step_service_codes=step_service_codes,
            postman_config=postman_config,
            native=use_native,
        )
        payload: dict[str, Any] = {
            "info": {
                "name": f"FinTest Scenario — {scenario.title}",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                "description": desc,
            },
            "item": items,
        }
        if collection_variables:
            payload["variable"] = collection_variables
        payload["event"] = merge_collection_prerequest_events(
            gen_event,
            macro_event,
            bxm_prerequest_collection_event(postman_config),
        )
        return payload

    @staticmethod
    def _ordered_service_codes_from_steps(steps_json: str | None) -> list[str]:
        raw = parse_steps_list(loads_json(steps_json, []))
        rows: list[tuple[int, str]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            num = item.get("number")
            if not isinstance(num, int):
                continue
            code = item.get("service_code")
            if isinstance(code, str) and code.strip():
                rows.append((num, code.strip()))
                continue
            parsed = TestCaseService._extract_service_code(item)
            if parsed:
                rows.append((num, parsed))
        rows.sort(key=lambda x: x[0])
        seen: set[str] = set()
        out: list[str] = []
        for _n, code in rows:
            if code in seen:
                continue
            seen.add(code)
            out.append(code)
        return out

    async def get_resolved_request_body(
        self,
        *,
        scenario_id: int,
        svc_code: str,
        rule_case_id: str,
        inst_cd: str,
    ) -> dict[str, Any]:
        """Resolve one testcase body in scenario order (for Postman export)."""
        from app.services.scenario_run_resolver import resolve_scenario_run

        scenario = await self._metadata.get_scenario_by_id(scenario_id)
        if scenario is None:
            raise EntityNotFoundError("Scenario", scenario_id)
        testcases = await self.list_for_scenario(scenario_id, inst_cd=inst_cd)
        preview = resolve_scenario_run(testcases, steps_json=scenario.steps_json)
        row = next(
            (
                r
                for r in preview.steps
                if r.svc_code == svc_code and r.rule_case_id == rule_case_id
            ),
            None,
        )
        if row is None:
            tc = await self.get_testcase(inst_cd, svc_code, rule_case_id)
            raw = loads_json(tc.request_body_json, {})
            if isinstance(raw, dict):
                from app.domain.dynamic_macro_resolver import resolve_mapping

                return resolve_mapping(raw, on_missing="keep")
            return raw
        return row.resolved_request_body

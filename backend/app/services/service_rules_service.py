"""Business logic for DB-primary YAML rules (validate/version/activate/rollback)."""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Any

import yaml

from app.utils.finix_yaml_dump import dump_finix_yaml
from app.utils.rule_input_omm_skeleton import merge_rule_inputs_with_skeleton

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.domain.cbs_service_taxonomy import (
    UNCLASSIFIED_DOMAIN,
    infer_business_domain,
)
from app.domain.dynamic_macro_resolver import validate_input_macros
from app.domain.rule_case_codec import extract_rules_list
from app.domain.yaml_rules_order import sort_rules_normal_then_error
from app.models.fnx_rule_doc_current import ServiceRuleCurrent
from app.models.fnx_rule_doc_hist import ServiceRuleHistory
from app.repositories.cbs_service_catalog_repo import CbsServiceCatalogRepository
from app.repositories.fnx_rule_case_repo import FnxRuleCaseRepository
from app.repositories.fnx_testcase_repo import FnxTestcaseRepository
from app.repositories.service_rules_repo import ServiceRulesRepository

logger = logging.getLogger(__name__)


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


_RULE_TYPES = frozenset({"E", "N"})
_RULE_TYPE_SUFFIX = {"E": "E", "N": "N"}
_ALLOWED_TAGS = frozenset({"input", "business"})
_LEGACY_TAG_TO_CANONICAL = {
    "input": "input",
    "validation": "input",
    "required": "input",
    "format": "input",
    "business": "business",
    "implementation": "business",
    "output": "business",
    "customer": "business",
}
_MAX_SOURCE_EVIDENCE_SNIPPET_LEN = 200


def _parse_yaml_document(yaml_text: str) -> dict[str, Any]:
    try:
        payload = yaml.safe_load(yaml_text) or {}
    except Exception as e:  # noqa: BLE001
        raise InvalidInputError(f"YAML 파싱 실패: {e}") from e
    if not isinstance(payload, dict):
        raise InvalidInputError("YAML 최상위는 object(map) 형태여야 합니다.")
    return payload


def _has_duplicate_case_ids(rules: list[Any]) -> bool:
    seen: set[str] = set()
    for r in rules:
        if not isinstance(r, dict):
            continue
        cid = r.get("case_id")
        if not (isinstance(cid, str) and cid.strip()):
            continue
        cid2 = cid.strip()
        if cid2 in seen:
            return True
        seen.add(cid2)
    return False


def normalize_legacy_rule_fields(payload: dict[str, Any]) -> dict[str, Any]:
    """Map legacy rule_id/minimal_input/error|business|code into case_id/input/E|N."""
    rules = payload.get("rules")
    if not isinstance(rules, list):
        return payload

    for r in rules:
        if not isinstance(r, dict):
            continue

        if not (isinstance(r.get("case_id"), str) and str(r.get("case_id")).strip()):
            rid = r.get("rule_id")
            if isinstance(rid, str) and rid.strip():
                r["case_id"] = rid.strip()

        if not isinstance(r.get("input"), dict):
            minimal_input = r.get("minimal_input")
            if isinstance(minimal_input, dict):
                r["input"] = minimal_input

        rtype = str(r.get("rule_type") or "").strip()
        expect = r.get("expect") if isinstance(r.get("expect"), dict) else {}
        outcome = str(expect.get("outcome") or "").strip().lower()
        if rtype == "error":
            r["rule_type"] = "E"
        elif rtype == "business":
            r["rule_type"] = "E" if outcome == "error" else "N"
        elif rtype == "code":
            r["rule_type"] = "N"
        elif rtype.upper() in _RULE_TYPES:
            r["rule_type"] = rtype.upper()

        tags = r.get("tags")
        if isinstance(tags, list):
            if not tags:
                r["tags"] = ["input"] if str(r.get("rule_type") or "").strip() == "E" else ["business"]
            else:
                normalized_tags: list[str] = []
                for tag in tags:
                    raw = str(tag).strip().lower()
                    if not raw:
                        continue
                    canonical = _LEGACY_TAG_TO_CANONICAL.get(raw, raw)
                    if canonical not in normalized_tags:
                        normalized_tags.append(canonical)
                r["tags"] = normalized_tags

        if str(r.get("rule_type") or "").strip() == "N" and isinstance(expect, dict):
            validation_target = expect.get("validation_target")
            if not (isinstance(validation_target, str) and validation_target.strip()):
                desc = str(r.get("description") or "").strip()
                expect["validation_target"] = desc or "response matches expected outcome"
                r["expect"] = expect

        evidence = r.get("source_evidence")
        if not isinstance(evidence, dict):
            r["source_evidence"] = {
                "method": "legacy",
                "snippet": "imported from legacy YAML",
            }

        r.pop("rule_id", None)
        r.pop("minimal_input", None)
        r.pop("severity", None)

    return payload


def normalize_duplicate_case_ids(payload: dict[str, Any]) -> dict[str, Any]:
    """Reassign canonical case_id values when duplicates are detected."""
    service_code = str(payload.get("service_code") or "").strip()
    rules = payload.get("rules")
    if not service_code or not isinstance(rules, list):
        return payload
    if not _has_duplicate_case_ids(rules):
        return payload

    counters = {"E": 0, "N": 0}
    for r in rules:
        if not isinstance(r, dict):
            continue
        rtype = str(r.get("rule_type") or "").strip()
        if rtype not in _RULE_TYPE_SUFFIX:
            continue
        counters[rtype] += 1
        suffix = _RULE_TYPE_SUFFIX[rtype]
        r["case_id"] = f"{service_code}-{suffix}-{counters[rtype]:03d}"
    return payload


def normalize_duplicate_rule_ids(payload: dict[str, Any]) -> dict[str, Any]:
    """Backward-compatible alias."""
    return normalize_duplicate_case_ids(normalize_legacy_rule_fields(payload))


def _collapse_snippet(text: str) -> str:
    collapsed = " ".join((text or "").split())
    if len(collapsed) <= _MAX_SOURCE_EVIDENCE_SNIPPET_LEN:
        return collapsed
    return collapsed[:_MAX_SOURCE_EVIDENCE_SNIPPET_LEN].rstrip()


def truncate_source_evidence_snippets(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalize and cap source_evidence.snippet length for readability."""
    rules = payload.get("rules")
    if not isinstance(rules, list):
        return payload
    for r in rules:
        if not isinstance(r, dict):
            continue
        evidence = r.get("source_evidence")
        if not isinstance(evidence, dict):
            continue
        snippet = evidence.get("snippet")
        if isinstance(snippet, str) and snippet.strip():
            evidence["snippet"] = _collapse_snippet(snippet)
    return payload


def autofill_missing_assertions(payload: dict[str, Any]) -> dict[str, Any]:
    """Ensure assertions is a list; for E+error_code, seed $.error_code when omitted."""
    rules = payload.get("rules")
    if not isinstance(rules, list):
        return payload
    for r in rules:
        if not isinstance(r, dict):
            continue
        had_assertions_key = "assertions" in r
        assertions = r.get("assertions")
        if assertions is None or not isinstance(assertions, list):
            r["assertions"] = []
            assertions = r["assertions"]

        rtype = str(r.get("rule_type") or "").strip()
        if rtype != "E":
            continue
        expect = r.get("expect")
        if not isinstance(expect, dict):
            continue
        error_code = expect.get("error_code")
        if not (isinstance(error_code, str) and error_code.strip()):
            continue
        if len(assertions) == 0 and not had_assertions_key:
            assertions.append(
                {
                    "path": "$.error_code",
                    "op": "equals",
                    "value": error_code.strip(),
                }
            )
    return payload


def _validate_assertion(idx: int, aidx: int, assertion: Any) -> None:
    if not isinstance(assertion, dict):
        raise InvalidInputError(
            f"rules[{idx}].assertions[{aidx}]는 object(map) 형태여야 합니다."
        )
    path = assertion.get("path")
    op = assertion.get("op")
    if not (isinstance(path, str) and path.strip()):
        raise InvalidInputError(f"rules[{idx}].assertions[{aidx}].path가 필요합니다.")
    if not (isinstance(op, str) and op.strip()):
        raise InvalidInputError(f"rules[{idx}].assertions[{aidx}].op가 필요합니다.")


def _validate_one_rule(idx: int, r: dict[str, Any], seen: set[str]) -> None:
    """Validate a single rule object; raises InvalidInputError on failure."""
    cid = r.get("case_id")
    if not (isinstance(cid, str) and cid.strip()):
        raise InvalidInputError(f"rules[{idx}].case_id가 필요합니다.")
    cid2 = cid.strip()
    if cid2 in seen:
        raise InvalidInputError(f"case_id 중복: {cid2}")
    seen.add(cid2)

    rtype = r.get("rule_type")
    if not (isinstance(rtype, str) and rtype.strip()):
        raise InvalidInputError(f"rules[{idx}].rule_type가 필요합니다.")
    rtype_norm = rtype.strip()
    if rtype_norm not in _RULE_TYPES:
        raise InvalidInputError(
            f"rules[{idx}].rule_type는 E|N 중 하나여야 합니다."
        )

    title = r.get("title")
    description = r.get("description")
    if not (isinstance(title, str) and title.strip()):
        raise InvalidInputError(f"rules[{idx}].title이 필요합니다.")
    if not (isinstance(description, str) and description.strip()):
        raise InvalidInputError(f"rules[{idx}].description이 필요합니다.")
    # Content quality (length, language, vagueness) is prompt guidance only — not schema.

    rule_input = r.get("input")
    if not isinstance(rule_input, dict):
        raise InvalidInputError(f"rules[{idx}].input은 object(map) 형태여야 합니다.")
    macro_errors = validate_input_macros(rule_input, path=f"rules[{idx}].input")
    if macro_errors:
        raise InvalidInputError(macro_errors[0])

    for meta_key in ("extract", "use"):
        block = r.get(meta_key)
        if block is None:
            continue
        if not isinstance(block, dict):
            raise InvalidInputError(
                f"rules[{idx}].{meta_key}는 object(map) 형태여야 합니다.",
            )
        if "auto" in block and not isinstance(block.get("auto"), bool):
            raise InvalidInputError(
                f"rules[{idx}].{meta_key}.auto는 true|false 여야 합니다.",
            )

    assertions = r.get("assertions")
    if not isinstance(assertions, list):
        raise InvalidInputError(f"rules[{idx}].assertions는 list 형태여야 합니다.")
    for aidx, assertion in enumerate(assertions):
        _validate_assertion(idx, aidx, assertion)

    tags = r.get("tags")
    if not isinstance(tags, list) or not tags:
        raise InvalidInputError(f"rules[{idx}].tags는 비어 있지 않은 list여야 합니다.")
    for tidx, tag in enumerate(tags):
        tag_norm = str(tag).strip().lower()
        if tag_norm not in _ALLOWED_TAGS:
            raise InvalidInputError(
                f"rules[{idx}].tags[{tidx}]는 input|business 중 하나여야 합니다."
            )

    expect = r.get("expect")
    if not isinstance(expect, dict):
        raise InvalidInputError(f"rules[{idx}].expect는 object(map) 형태여야 합니다.")
    outcome = expect.get("outcome")
    if not (isinstance(outcome, str) and outcome.strip() in {"error", "success"}):
        raise InvalidInputError(
            f"rules[{idx}].expect.outcome은 error|success 여야 합니다."
        )
    http_status = expect.get("http_status")
    if http_status is not None and http_status != "":
        try:
            int(http_status)
        except (TypeError, ValueError) as e:
            raise InvalidInputError(
                f"rules[{idx}].expect.http_status는 정수 또는 null 이어야 합니다."
            ) from e

    if rtype_norm == "E":
        error_code = expect.get("error_code")
        has_error_code = isinstance(error_code, str) and bool(error_code.strip())
        # Draft/Postman E cases often know "should fail" but not the CBS code yet.
        # Require a concrete code only when assertions claim to verify one.
        if assertions and not has_error_code:
            raise InvalidInputError(
                f"rules[{idx}].expect.error_code가 필요합니다 "
                "(rule_type=E 이고 assertions가 있을 때)."
            )
        if has_error_code and assertions:
            first = assertions[0] if assertions else None
            if isinstance(first, dict):
                first_value = first.get("value")
                if str(first.get("path") or "").strip() != "$.error_code" or str(
                    first_value
                ).strip() != error_code.strip():
                    raise InvalidInputError(
                        f"rules[{idx}].assertions[0]은 expect.error_code와 일치하는 "
                        "$.error_code 검증이어야 합니다."
                    )
    else:
        validation_target = expect.get("validation_target")
        if not (isinstance(validation_target, str) and validation_target.strip()):
            raise InvalidInputError(
                f"rules[{idx}].expect.validation_target이 필요합니다 (rule_type=N)."
            )

    evidence = r.get("source_evidence")
    if not isinstance(evidence, dict):
        raise InvalidInputError(
            f"rules[{idx}].source_evidence는 object(map) 형태여야 합니다."
        )
    method = evidence.get("method")
    snippet = evidence.get("snippet")
    if not (isinstance(method, str) and method.strip()):
        raise InvalidInputError(
            f"rules[{idx}].source_evidence.method가 필요합니다."
        )
    if not (isinstance(snippet, str) and snippet.strip()):
        raise InvalidInputError(
            f"rules[{idx}].source_evidence.snippet이 필요합니다."
        )


def _validate_rules_structure(
    payload: dict[str, Any],
    *,
    soft_drop_invalid_rules: bool = False,
) -> None:
    """
    Validate rules list shape/template only (required fields and types).

    When soft_drop_invalid_rules=True (AI generation), per-rule schema errors
    drop that case and continue so one bad case cannot abort the whole YAML.
    """
    rules = payload.get("rules") or []
    if not isinstance(rules, list):
        raise InvalidInputError("YAML의 rules는 list 형태여야 합니다.")
    if not rules:
        raise InvalidInputError("YAML의 rules는 비어 있을 수 없습니다.")

    kept: list[Any] = []
    seen: set[str] = set()
    for idx, r in enumerate(rules):
        if not isinstance(r, dict):
            msg = f"rules[{idx}]는 object(map) 형태여야 합니다."
            if soft_drop_invalid_rules:
                logger.warning("Dropping invalid rule: %s", msg)
                continue
            raise InvalidInputError(msg)

        try:
            _validate_one_rule(len(kept), r, seen)
        except InvalidInputError as e:
            if soft_drop_invalid_rules:
                logger.warning(
                    "Dropping invalid rule rules[%s]: %s",
                    idx,
                    e,
                )
                continue
            raise
        kept.append(r)

    payload["rules"] = kept
    if not kept:
        raise InvalidInputError(
            "유효한 rules가 없습니다. 스키마 검증에 실패한 케이스만 있었습니다."
        )


def validate_and_prepare_yaml(
    yaml_text: str,
    *,
    input_skeleton: dict[str, Any] | None = None,
    soft_drop_invalid_rules: bool = False,
) -> tuple[str, dict[str, Any]]:
    """Parse YAML, normalize, auto-fix, validate structure, return canonical text."""
    payload = _parse_yaml_document(yaml_text)
    payload = normalize_legacy_rule_fields(payload)
    payload = normalize_duplicate_case_ids(payload)
    payload = truncate_source_evidence_snippets(payload)
    payload = autofill_missing_assertions(payload)
    if input_skeleton:
        merge_rule_inputs_with_skeleton(payload, input_skeleton)
    _validate_rules_structure(
        payload,
        soft_drop_invalid_rules=soft_drop_invalid_rules,
    )
    payload = sort_rules_normal_then_error(payload)
    return dump_finix_yaml(payload), payload


def _validate_and_parse_yaml(yaml_text: str) -> dict[str, Any]:
    _, parsed = validate_and_prepare_yaml(yaml_text)
    return parsed


@dataclass(slots=True)
class ServiceRuleRegistryRow:
    """One row per service for Rules/Meta list UI."""

    service_code: str
    service_name: str
    source_version: str | None
    status: str
    rules: int
    bundle_id: int
    bundle_version: int
    last_updated_at: Any
    last_updated_by: str | None
    is_active: bool
    version_count: int = 0
    active_bundle_version: int | None = None
    draft_bundle_version: int | None = None
    has_approved: bool = False
    has_draft: bool = False
    history_count: int = 0
    business_domain: str = "UNCLASSIFIED"
    component_code: str = ""


def _rule_count_from_json(rules_json: str | None) -> int:
    if not rules_json:
        return 0
    try:
        parsed = json.loads(rules_json)
    except Exception:  # noqa: BLE001
        return 0
    rules = parsed.get("rules") if isinstance(parsed, dict) else None
    return len(rules) if isinstance(rules, list) else 0


def _editor_view(row: ServiceRuleCurrent) -> dict[str, Any]:
    """Fields used by API adapters for the working document."""
    if row.has_draft:
        return {
            "yaml_text": row.draft_yaml_text or "",
            "rules_json": row.draft_rules_json,
            "checksum": row.draft_checksum or "",
            "source_version": row.draft_source_version,
            "status": "draft",
            "updated_at": row.draft_updated_at or row.updated_at,
            "updated_by": row.draft_updated_by or row.updated_by,
            "is_active": False,
        }
    return {
        "yaml_text": row.yaml_text or "",
        "rules_json": row.rules_json,
        "checksum": row.checksum or "",
        "source_version": row.source_version,
        "status": "active" if row.has_applied else "draft",
        "updated_at": row.updated_at,
        "updated_by": row.updated_by,
        "is_active": row.has_applied,
    }


class ServiceRulesService:
    """Workflow for current YAML + draft + history."""

    def __init__(
        self,
        *,
        repo: ServiceRulesRepository,
        cbs_catalog: CbsServiceCatalogRepository | None = None,
        case_repo: FnxRuleCaseRepository | None = None,
        tc_repo: FnxTestcaseRepository | None = None,
    ) -> None:
        self._repo = repo
        self._cbs_catalog = cbs_catalog
        self._case_repo = case_repo
        self._tc_repo = tc_repo

    async def list_registry(
        self,
        *,
        query: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
        inst_cd: str | None = None,
    ) -> tuple[list[ServiceRuleRegistryRow], int]:
        from app.domain.inst_scope import require_inst_cd

        if self._case_repo is not None and inst_cd is not None:
            return await self._list_registry_from_fnx(
                query=query,
                status=status,
                limit=limit,
                offset=offset,
                inst_cd=require_inst_cd(inst_cd),
            )
        return await self._list_registry_from_facade(
            query=query,
            status=status,
            limit=limit,
            offset=offset,
        )

    async def _list_registry_from_fnx(
        self,
        *,
        query: str | None,
        status: str | None,
        limit: int,
        offset: int,
        inst_cd: str,
    ) -> tuple[list[ServiceRuleRegistryRow], int]:
        assert self._case_repo is not None
        taxonomy: dict[str, tuple[str, str]] = {}
        if self._cbs_catalog is not None:
            try:
                taxonomy = await self._cbs_catalog.taxonomy_by_service_code()
            except Exception:  # noqa: BLE001
                logger.warning(
                    "Failed to load CBS taxonomy for rules registry", exc_info=True
                )

        svcs = await self._case_repo.list_svcs(inst_cd=inst_cd, limit=5000)
        rows: list[ServiceRuleRegistryRow] = []
        for svc in svcs:
            cases = await self._case_repo.list_cases(svc.svc_code, inst_cd=inst_cd)
            has_draft = any(c.has_draft for c in cases)
            has_applied = any((c.checksum or "").strip() for c in cases)
            editor_rules = await self._case_repo.list_editor_rules(
                svc.svc_code, inst_cd=inst_cd
            )
            facade = await self._repo.get_current(svc.svc_code, inst_cd=inst_cd)
            if facade is None:
                # Keep activate/bundle_id compatible after dual-write paths.
                facade = await self._repo.ensure_current(svc.svc_code, inst_cd=inst_cd)
            history_count = await self._repo.count_history(svc.svc_code, inst_cd=inst_cd)
            display_status = "draft" if has_draft else ("active" if has_applied else "draft")
            name = (svc.service_name_snapshot or "").strip() or svc.svc_code
            domain, component = taxonomy.get(svc.svc_code, ("", ""))
            if not domain:
                domain = infer_business_domain(svc.svc_code)
            updated_at = svc.draft_updated_at if has_draft else svc.updated_at
            updated_by = (
                svc.draft_updated_by if has_draft else svc.updated_by
            )
            source_version = (
                svc.draft_source_version if has_draft else svc.source_version
            )
            rows.append(
                ServiceRuleRegistryRow(
                    service_code=svc.svc_code,
                    service_name=name,
                    source_version=source_version,
                    status=display_status,
                    rules=len(editor_rules),
                    bundle_id=facade.id,
                    bundle_version=1 if has_applied else 0,
                    last_updated_at=updated_at,
                    last_updated_by=updated_by,
                    is_active=has_applied and not has_draft,
                    version_count=history_count,
                    active_bundle_version=1 if has_applied else None,
                    draft_bundle_version=1 if has_draft else None,
                    has_approved=False,
                    has_draft=has_draft,
                    history_count=history_count,
                    business_domain=domain or UNCLASSIFIED_DOMAIN,
                    component_code=component or "",
                )
            )
        return self._paginate_registry_rows(
            rows, query=query, status=status, limit=limit, offset=offset
        )

    async def _list_registry_from_facade(
        self,
        *,
        query: str | None,
        status: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[ServiceRuleRegistryRow], int]:
        taxonomy: dict[str, tuple[str, str]] = {}
        if self._cbs_catalog is not None:
            try:
                taxonomy = await self._cbs_catalog.taxonomy_by_service_code()
            except Exception:  # noqa: BLE001
                logger.warning("Failed to load CBS taxonomy for rules registry", exc_info=True)

        rows_raw = await self._repo.list_all_current(limit=5000, offset=0)
        rows: list[ServiceRuleRegistryRow] = []
        for row in rows_raw:
            history_count = await self._repo.count_history(row.service_code)
            view = _editor_view(row)
            rules_json = (
                row.draft_rules_json if row.has_draft else row.rules_json
            )
            display_status = "draft" if row.has_draft else (
                "active" if row.has_applied else "draft"
            )
            name = (row.service_name_snapshot or "").strip() or row.service_code
            domain, component = taxonomy.get(row.service_code, ("", ""))
            if not domain:
                domain = infer_business_domain(row.service_code)
            rows.append(
                ServiceRuleRegistryRow(
                    service_code=row.service_code,
                    service_name=name,
                    source_version=view["source_version"],
                    status=display_status,
                    rules=_rule_count_from_json(rules_json),
                    bundle_id=row.id,
                    bundle_version=1 if row.has_applied else 0,
                    last_updated_at=view["updated_at"],
                    last_updated_by=view["updated_by"],
                    is_active=row.has_applied and not row.has_draft,
                    version_count=history_count,
                    active_bundle_version=1 if row.has_applied else None,
                    draft_bundle_version=1 if row.has_draft else None,
                    has_approved=False,
                    has_draft=row.has_draft,
                    history_count=history_count,
                    business_domain=domain or UNCLASSIFIED_DOMAIN,
                    component_code=component or "",
                )
            )
        return self._paginate_registry_rows(
            rows, query=query, status=status, limit=limit, offset=offset
        )

    @staticmethod
    def _paginate_registry_rows(
        rows: list[ServiceRuleRegistryRow],
        *,
        query: str | None,
        status: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[ServiceRuleRegistryRow], int]:
        q = (query or "").strip().lower()
        if q:
            rows = [
                r
                for r in rows
                if q in r.service_code.lower()
                or q in r.service_name.lower()
                or (r.source_version or "").lower().find(q) >= 0
                or (r.last_updated_by or "").lower().find(q) >= 0
            ]

        st = (status or "").strip().lower()
        if st == "active":
            rows = [r for r in rows if r.active_bundle_version is not None]
        elif st == "draft":
            rows = [r for r in rows if r.has_draft]
        elif st:
            rows = [r for r in rows if r.status.lower() == st]

        rows.sort(
            key=lambda r: (
                r.last_updated_at.isoformat() if r.last_updated_at else "",
                r.service_code,
            ),
            reverse=True,
        )
        total = len(rows)
        page = rows[offset : offset + limit]
        return page, total

    async def get_editor_base_rules(
        self, service_code: str, *, inst_cd: str
    ) -> list[dict[str, Any]]:
        """Institution-scoped merge/editor base rules (case SoT)."""
        from app.domain.inst_scope import require_inst_cd

        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code:
            return []
        if self._case_repo is not None:
            return await self._case_repo.list_editor_rules(code, inst_cd=inst)
        current = await self._repo.get_current(code, inst_cd=inst)
        if current is None:
            return []
        return extract_rules_list(
            current.draft_rules_json
            if current.has_draft
            else current.rules_json
        )

    async def has_working_draft(self, service_code: str, *, inst_cd: str) -> bool:
        """True when institution-scoped cases have draft fields."""
        from app.domain.inst_scope import require_inst_cd

        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code:
            return False
        if self._case_repo is not None:
            return await self._case_repo.has_any_draft(code, inst_cd=inst)
        current = await self._repo.get_current(code, inst_cd=inst)
        return bool(current and current.has_draft)

    async def has_applied_rules(self, service_code: str, *, inst_cd: str) -> bool:
        from app.domain.inst_scope import require_inst_cd

        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code:
            return False
        if self._case_repo is not None:
            return await self._case_repo.has_any_applied(code, inst_cd=inst)
        current = await self._repo.get_current(code, inst_cd=inst)
        return bool(current and current.has_applied)

    async def upsert_draft(
        self,
        *,
        service_code: str,
        yaml_text: str,
        source_version: str | None,
        created_by: str | None,
        inst_cd: str,
    ) -> ServiceRuleCurrent:
        from app.domain.inst_scope import require_inst_cd

        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        if not (yaml_text or "").strip():
            raise InvalidInputError("yaml_text가 비어있습니다.")

        canonical_yaml, parsed = validate_and_prepare_yaml(yaml_text)
        row = await self._repo.ensure_current(code, inst_cd=inst)
        row.service_name_snapshot = str(parsed.get("service_name") or "") or None
        row.draft_yaml_text = canonical_yaml
        row.draft_rules_json = json.dumps(parsed, ensure_ascii=False)
        row.draft_checksum = _sha256_text(canonical_yaml)
        row.draft_source_version = source_version or None
        row.draft_updated_by = created_by
        from datetime import datetime, timezone

        row.draft_updated_at = datetime.now(timezone.utc)
        row = await self._repo.flush_current(row)
        await self._dual_write_draft(row, parsed, created_by, inst_cd=inst)
        return row

    async def _dual_write_draft(
        self,
        row: ServiceRuleCurrent,
        parsed: dict[str, Any],
        updated_by: str | None,
        *,
        inst_cd: str,
    ) -> None:
        if self._case_repo is None:
            return
        await self._case_repo.upsert_draft_cases_from_payload(
            svc_code=row.service_code,
            parsed=parsed,
            updated_by=updated_by,
            inst_cd=inst_cd,
        )
        await self._case_repo.sync_header_from_current(row, inst_cd=inst_cd)

    async def _dual_write_apply(
        self,
        row: ServiceRuleCurrent,
        *,
        applied_by: str | None,
        change_kind: str = "apply",
        inst_cd: str,
    ) -> None:
        if self._case_repo is None:
            return
        await self._case_repo.apply_draft_cases(
            svc_code=row.service_code,
            applied_by=applied_by,
            change_kind=change_kind,
            inst_cd=inst_cd,
        )
        await self._case_repo.sync_header_from_current(row, inst_cd=inst_cd)

    async def _dual_write_restore(
        self,
        row: ServiceRuleCurrent,
        parsed: dict[str, Any],
        *,
        updated_by: str | None,
        change_kind: str = "restore",
        inst_cd: str,
    ) -> None:
        if self._case_repo is None:
            return
        await self._case_repo.replace_applied_cases_from_payload(
            svc_code=row.service_code,
            parsed=parsed,
            updated_by=updated_by,
            change_kind=change_kind,
            clear_draft=True,
            inst_cd=inst_cd,
        )
        await self._case_repo.sync_header_from_current(row, inst_cd=inst_cd)

    async def create_draft(
        self,
        *,
        service_code: str,
        yaml_text: str,
        source_version: str | None,
        created_by: str | None,
        inst_cd: str,
    ) -> ServiceRuleCurrent:
        """AI / create paths upsert the working draft (no new version row)."""
        return await self.upsert_draft(
            service_code=service_code,
            yaml_text=yaml_text,
            source_version=source_version,
            created_by=created_by,
            inst_cd=inst_cd,
        )

    async def update_draft(
        self,
        *,
        service_code: str,
        bundle_id: int,
        yaml_text: str,
        source_version: str | None = None,
        created_by: str | None = None,
        inst_cd: str,
    ) -> ServiceRuleCurrent:
        code = (service_code or "").strip()
        row = await self._repo.get_current_by_id(bundle_id)
        if row is None:
            row = await self._repo.get_current(code, inst_cd=inst_cd)
        if row is None:
            raise EntityNotFoundError("ServiceRuleCurrent", bundle_id)
        if row.service_code != code:
            raise InvalidInputError("service_code mismatch")
        return await self.upsert_draft(
            service_code=code,
            yaml_text=yaml_text,
            source_version=source_version,
            created_by=created_by,
            inst_cd=inst_cd,
        )

    async def get_active(
        self, service_code: str, *, inst_cd: str | None = None
    ) -> ServiceRuleCurrent | None:
        return await self._repo.get_active_bundle(service_code, inst_cd=inst_cd)

    async def get_current(
        self, service_code: str, *, inst_cd: str | None = None
    ) -> ServiceRuleCurrent | None:
        return await self._repo.get_current(service_code, inst_cd=inst_cd)

    async def get_bundle(self, bundle_id: int) -> ServiceRuleCurrent | ServiceRuleHistory:
        """Resolve editor id: current row id, else history id."""
        current = await self._repo.get_current_by_id(bundle_id)
        if current is not None:
            return current
        history = await self._repo.get_history(bundle_id)
        if history is None:
            raise EntityNotFoundError("ServiceRuleDocument", bundle_id)
        return history

    async def get_editor_document(
        self, service_code: str, *, inst_cd: str | None = None
    ) -> ServiceRuleCurrent | None:
        """Façade row for legacy callers. Prefer get_editor_bundle_dict with inst_cd."""
        return await self._repo.get_current(service_code, inst_cd=inst_cd)

    async def get_editor_bundle_dict(
        self, service_code: str, *, inst_cd: str
    ) -> dict[str, Any] | None:
        """Institution-scoped editor document as a plain dict (no façade write)."""
        from app.domain.inst_scope import require_inst_cd
        from app.domain.rule_case_codec import assemble_yaml_from_rules

        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code or self._case_repo is None:
            return None
        rules = await self._case_repo.list_editor_rules(code, inst_cd=inst)
        svc = await self._case_repo.get_svc(code, inst_cd=inst)
        if not rules and svc is None:
            return None
        has_draft = await self._case_repo.has_any_draft(code, inst_cd=inst)
        has_applied = await self._case_repo.has_any_applied(code, inst_cd=inst)
        if not rules and not has_draft and not has_applied:
            return None
        name = (svc.service_name_snapshot if svc else None) or code
        yaml_text = ""
        parsed: dict[str, Any] = {"service_code": code, "service_name": name, "rules": []}
        checksum = ""
        if rules:
            yaml_text, parsed = assemble_yaml_from_rules(
                svc_code=code,
                service_name=name,
                rules=rules,
                source_version=(
                    (svc.draft_source_version if has_draft else svc.source_version)
                    if svc
                    else None
                ),
            )
            checksum = _sha256_text(yaml_text)
        facade = await self._repo.get_current(code, inst_cd=inst)
        case_meta = await self._case_meta_with_pool_flags(code, inst_cd=inst)
        return {
            "id": facade.id if facade is not None else 0,
            "service_code": code,
            "service_name_snapshot": name,
            "status": "draft" if has_draft else ("active" if has_applied else "draft"),
            "is_active": has_applied and not has_draft,
            "version": 1 if has_applied else 0,
            "source_version": (
                (svc.draft_source_version if has_draft else svc.source_version)
                if svc
                else None
            ),
            "checksum": checksum,
            "created_by": (
                (svc.draft_updated_by if has_draft else svc.updated_by) if svc else None
            ),
            "created_at": svc.created_at if svc else None,
            "updated_at": (
                (svc.draft_updated_at if has_draft else svc.updated_at) if svc else None
            ),
            "yaml_text": yaml_text,
            "rules": parsed,
            "has_draft": has_draft,
            "case_meta": case_meta,
        }

    async def _sync_facade_from_cases(
        self,
        row: ServiceRuleCurrent,
        *,
        inst_cd: str,
        updated_by: str | None = None,
    ) -> ServiceRuleCurrent:
        """Rebuild façade applied/draft YAML from fnx_rule_case rows."""
        if self._case_repo is None:
            return row

        from app.domain.inst_scope import require_inst_cd

        code = row.service_code
        inst = require_inst_cd(inst_cd)

        applied_asm = await self._case_repo.assemble_applied_yaml(
            svc_code=code,
            inst_cd=inst,
            service_name=row.service_name_snapshot,
            source_version=row.source_version,
        )
        if applied_asm:
            yaml_text, parsed = applied_asm
            row.yaml_text = yaml_text
            row.rules_json = json.dumps(parsed, ensure_ascii=False)
            row.checksum = _sha256_text(yaml_text)
        else:
            row.yaml_text = ""
            row.rules_json = None
            row.checksum = ""

        has_draft = await self._case_repo.has_any_draft(code, inst_cd=inst)
        if has_draft:
            editor_asm = await self._case_repo.assemble_editor_yaml(
                svc_code=code,
                inst_cd=inst,
                service_name=row.service_name_snapshot,
                source_version=row.source_version,
            )
            if editor_asm:
                draft_yaml, draft_parsed = editor_asm
                row.draft_yaml_text = draft_yaml
                row.draft_rules_json = json.dumps(draft_parsed, ensure_ascii=False)
                row.draft_checksum = _sha256_text(draft_yaml)
        else:
            row.draft_yaml_text = None
            row.draft_rules_json = None
            row.draft_checksum = None
            row.draft_source_version = None
            row.draft_updated_at = None
            row.draft_updated_by = None

        if updated_by:
            row.updated_by = updated_by
        row = await self._repo.flush_current(row)
        await self._case_repo.sync_header_from_current(row, inst_cd=inst)
        return row

    async def _case_meta_with_pool_flags(
        self, service_code: str, *, inst_cd: str
    ) -> list[dict[str, Any]]:
        if self._case_repo is None:
            return []
        case_meta = await self._case_repo.list_case_meta(service_code, inst_cd=inst_cd)
        if self._tc_repo is None:
            for item in case_meta:
                item["has_pool_testcase"] = False
            return case_meta
        for item in case_meta:
            tc = await self._tc_repo.get(
                inst_cd=inst_cd,
                svc_code=service_code,
                rule_case_id=item["case_id"],
            )
            item["has_pool_testcase"] = tc is not None
        return case_meta

    async def _assert_pool_testcase_exists(
        self,
        *,
        inst_cd: str,
        service_code: str,
        case_id: str,
    ) -> None:
        if self._tc_repo is None:
            return
        tc = await self._tc_repo.get(
            inst_cd=inst_cd,
            svc_code=service_code,
            rule_case_id=case_id,
        )
        if tc is None:
            raise InvalidInputError(
                f"{case_id}: 확정하려면 먼저 TC 풀·실행 탭에서 "
                "「풀에 반영」하세요."
            )

    async def _assert_pool_testcases_for_draft_cases(
        self,
        *,
        inst_cd: str,
        service_code: str,
    ) -> None:
        if self._case_repo is None or self._tc_repo is None:
            return
        missing: list[str] = []
        for row in await self._case_repo.list_cases(service_code, inst_cd=inst_cd):
            if not row.has_draft:
                continue
            tc = await self._tc_repo.get(
                inst_cd=inst_cd,
                svc_code=service_code,
                rule_case_id=row.rule_case_id,
            )
            if tc is None:
                missing.append(row.rule_case_id)
        if missing:
            joined = ", ".join(missing)
            raise InvalidInputError(
                f"확정하려면 먼저 「풀에 반영」하세요: {joined}"
            )

    async def apply_draft_case(
        self,
        *,
        service_code: str,
        case_id: str,
        applied_by: str | None = None,
        inst_cd: str,
    ) -> dict[str, Any]:
        """Promote one rule case draft to applied; rebuild façade from cases."""
        from app.domain.inst_scope import require_inst_cd

        code = (service_code or "").strip()
        cid = (case_id or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code or not cid:
            raise InvalidInputError("service_code와 case_id가 필요합니다.")
        if self._case_repo is None:
            raise InvalidInputError("규칙 케이스 저장소가 설정되지 않았습니다.")

        case_row = await self._case_repo.get_case_by_case_id(code, cid, inst_cd=inst)
        if case_row is None:
            raise EntityNotFoundError("RuleCase", f"{code}/{cid}")
        if not case_row.has_draft:
            raise InvalidInputError(
                f"{cid}: 확정할 작업본이 없습니다. 저장 후 다시 시도하세요."
            )
        await self._assert_pool_testcase_exists(
            inst_cd=inst, service_code=code, case_id=cid
        )

        await self._case_repo.apply_draft_case(
            svc_code=code,
            case_id=cid,
            applied_by=applied_by,
            inst_cd=inst,
        )
        row = await self._repo.ensure_current(code, inst_cd=inst)
        row = await self._sync_facade_from_cases(
            row, inst_cd=inst, updated_by=applied_by
        )

        bundle = await self.get_editor_bundle_dict(code, inst_cd=inst)
        if bundle is None:
            raise InvalidInputError("편집 문서를 갱신하지 못했습니다.")
        return bundle

    async def deactivate_applied_case(
        self,
        *,
        service_code: str,
        case_id: str,
        updated_by: str | None = None,
        inst_cd: str,
    ) -> dict[str, Any]:
        """Remove one case from applied (scenario-eligible) state."""
        from app.domain.inst_scope import require_inst_cd

        code = (service_code or "").strip()
        cid = (case_id or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code or not cid:
            raise InvalidInputError("service_code와 case_id가 필요합니다.")
        if self._case_repo is None:
            raise InvalidInputError("규칙 케이스 저장소가 설정되지 않았습니다.")

        case_row = await self._case_repo.get_case_by_case_id(code, cid, inst_cd=inst)
        if case_row is None:
            raise EntityNotFoundError("RuleCase", f"{code}/{cid}")
        if not self._case_repo.is_case_applied(case_row):
            raise InvalidInputError(f"{cid}: 확정된 케이스가 아닙니다.")

        await self._case_repo.deactivate_applied_case(
            svc_code=code,
            case_id=cid,
            updated_by=updated_by,
            inst_cd=inst,
        )
        row = await self._repo.ensure_current(code, inst_cd=inst)
        row = await self._sync_facade_from_cases(
            row, inst_cd=inst, updated_by=updated_by
        )

        bundle = await self.get_editor_bundle_dict(code, inst_cd=inst)
        if bundle is None:
            raise InvalidInputError("편집 문서를 갱신하지 못했습니다.")
        return bundle

    async def apply_draft(
        self,
        *,
        service_code: str,
        applied_by: str | None = None,
        inst_cd: str,
    ) -> ServiceRuleCurrent:
        from app.domain.inst_scope import require_inst_cd

        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd)
        row = await self._repo.get_current(code, inst_cd=inst)
        if row is None:
            raise EntityNotFoundError("ServiceRuleCurrent", code)
        if not row.has_draft:
            raise InvalidInputError("적용할 작업본이 없습니다.")
        await self._assert_pool_testcases_for_draft_cases(
            inst_cd=inst, service_code=code
        )

        row.yaml_text = row.draft_yaml_text or ""
        row.rules_json = row.draft_rules_json
        row.checksum = row.draft_checksum or _sha256_text(row.yaml_text)
        row.source_version = row.draft_source_version
        row.updated_by = applied_by or row.draft_updated_by
        row.draft_yaml_text = None
        row.draft_rules_json = None
        row.draft_checksum = None
        row.draft_source_version = None
        row.draft_updated_at = None
        row.draft_updated_by = None
        row = await self._repo.flush_current(row)

        # Every apply appends an immutable snapshot of what is now live.
        await self._repo.add_history(
            ServiceRuleHistory(
                inst_cd=inst,
                service_code=code,
                service_name_snapshot=row.service_name_snapshot,
                source_version=row.source_version,
                yaml_text=row.yaml_text,
                rules_json=row.rules_json,
                checksum=row.checksum,
                change_kind="apply",
                note="applied snapshot",
                created_by=applied_by or row.updated_by,
            )
        )
        await self._dual_write_apply(
            row, applied_by=applied_by or row.updated_by, inst_cd=inst
        )
        return row

    async def activate(self, bundle_id: int, *, inst_cd: str) -> ServiceRuleCurrent:
        """Compatibility: apply draft for the current row id."""
        row = await self._repo.get_current_by_id(bundle_id)
        if row is None:
            # If client still passes draft "bundle" id incorrectly, try as service lookup.
            raise EntityNotFoundError("ServiceRuleCurrent", bundle_id)
        return await self.apply_draft(
            service_code=row.service_code,
            applied_by=row.draft_updated_by,
            inst_cd=inst_cd,
        )

    async def restore_from_history(
        self,
        *,
        service_code: str,
        history_id: int,
        restored_by: str | None = None,
        inst_cd: str,
    ) -> ServiceRuleCurrent:
        from app.domain.inst_scope import require_inst_cd

        code = (service_code or "").strip()
        inst = require_inst_cd(inst_cd)
        hist = await self._repo.get_history(history_id)
        if hist is None:
            raise EntityNotFoundError("ServiceRuleHistory", history_id)
        if hist.service_code != code:
            raise InvalidInputError("service_code mismatch")
        if hist.inst_cd != inst:
            raise InvalidInputError("inst_cd mismatch")

        row = await self._repo.ensure_current(code, inst_cd=inst)
        if row.has_applied:
            await self._repo.add_history(
                ServiceRuleHistory(
                    inst_cd=inst,
                    service_code=code,
                    service_name_snapshot=row.service_name_snapshot,
                    source_version=row.source_version,
                    yaml_text=row.yaml_text,
                    rules_json=row.rules_json,
                    checksum=row.checksum,
                    change_kind="restore",
                    note=f"snapshot before restore from history {history_id}",
                    created_by=restored_by or row.updated_by,
                )
            )

        row.yaml_text = hist.yaml_text
        row.rules_json = hist.rules_json
        row.checksum = hist.checksum
        row.source_version = hist.source_version
        row.service_name_snapshot = hist.service_name_snapshot
        row.updated_by = restored_by
        # Clear draft so applied content is what the editor shows after restore.
        row.draft_yaml_text = None
        row.draft_rules_json = None
        row.draft_checksum = None
        row.draft_source_version = None
        row.draft_updated_at = None
        row.draft_updated_by = None
        row = await self._repo.flush_current(row)
        parsed: dict[str, Any] = {}
        if row.rules_json:
            try:
                loaded = json.loads(row.rules_json)
                if isinstance(loaded, dict):
                    parsed = loaded
            except Exception:  # noqa: BLE001
                parsed = {}
        if not parsed.get("rules") and (row.yaml_text or "").strip():
            try:
                _, parsed = validate_and_prepare_yaml(row.yaml_text)
            except Exception:  # noqa: BLE001
                logger.warning(
                    "restore dual-write: YAML parse failed for %s",
                    code,
                    exc_info=True,
                )
                parsed = {"service_code": code, "rules": []}
        await self._dual_write_restore(
            row,
            parsed,
            updated_by=restored_by,
            change_kind="restore",
            inst_cd=inst,
        )
        return row

    async def rollback(
        self, *, service_code: str, to_version: int, inst_cd: str
    ) -> ServiceRuleCurrent:
        """Compatibility: treat to_version as history_id."""
        return await self.restore_from_history(
            service_code=service_code, history_id=to_version, inst_cd=inst_cd
        )

    async def list_versions(
        self, service_code: str, *, inst_cd: str | None = None
    ) -> list[ServiceRuleHistory]:
        return await self._repo.list_history(service_code, inst_cd=inst_cd)

    async def list_versions_with_active_flag(
        self, service_code: str, *, inst_cd: str | None = None
    ) -> list[tuple[ServiceRuleHistory, bool]]:
        history = await self._repo.list_history(service_code, inst_cd=inst_cd)
        current = await self._repo.get_current(service_code, inst_cd=inst_cd)
        current_cs = (current.checksum if current and current.has_applied else "") or ""
        return [(h, bool(current_cs) and h.checksum == current_cs) for h in history]

    async def delete_bundle(self, *, service_code: str, bundle_id: int) -> None:
        """Delete a history snapshot (bundle_id == history_id)."""
        code = (service_code or "").strip()
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        hist = await self._repo.get_history(bundle_id)
        if hist is None:
            raise EntityNotFoundError("ServiceRuleHistory", bundle_id)
        if hist.service_code != code:
            raise InvalidInputError("service_code mismatch")
        deleted = await self._repo.delete_history(bundle_id)
        if not deleted:
            raise EntityNotFoundError("ServiceRuleHistory", bundle_id)

    def validate_yaml_text(self, *, yaml_text: str) -> dict[str, Any]:
        """Parse, normalize, and validate rules YAML without persisting."""
        if not (yaml_text or "").strip():
            raise InvalidInputError("yaml_text가 비어있습니다.")
        _, parsed = validate_and_prepare_yaml(yaml_text)
        return parsed


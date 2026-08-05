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
from app.domain.yaml_rules_order import sort_rules_normal_then_error
from app.models.service_rule_current import ServiceRuleCurrent
from app.models.service_rule_history import ServiceRuleHistory
from app.repositories.cbs_service_catalog_repo import CbsServiceCatalogRepository
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
    ) -> None:
        self._repo = repo
        self._cbs_catalog = cbs_catalog

    async def list_registry(
        self,
        *,
        query: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
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

    async def upsert_draft(
        self,
        *,
        service_code: str,
        yaml_text: str,
        source_version: str | None,
        created_by: str | None,
    ) -> ServiceRuleCurrent:
        code = (service_code or "").strip()
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        if not (yaml_text or "").strip():
            raise InvalidInputError("yaml_text가 비어있습니다.")

        canonical_yaml, parsed = validate_and_prepare_yaml(yaml_text)
        row = await self._repo.ensure_current(code)
        row.service_name_snapshot = str(parsed.get("service_name") or "") or None
        row.draft_yaml_text = canonical_yaml
        row.draft_rules_json = json.dumps(parsed, ensure_ascii=False)
        row.draft_checksum = _sha256_text(canonical_yaml)
        row.draft_source_version = source_version or None
        row.draft_updated_by = created_by
        from datetime import datetime, timezone

        row.draft_updated_at = datetime.now(timezone.utc)
        return await self._repo.flush_current(row)

    async def create_draft(
        self,
        *,
        service_code: str,
        yaml_text: str,
        source_version: str | None,
        created_by: str | None,
    ) -> ServiceRuleCurrent:
        """AI / create paths upsert the working draft (no new version row)."""
        return await self.upsert_draft(
            service_code=service_code,
            yaml_text=yaml_text,
            source_version=source_version,
            created_by=created_by,
        )

    async def update_draft(
        self,
        *,
        service_code: str,
        bundle_id: int,
        yaml_text: str,
        source_version: str | None = None,
        created_by: str | None = None,
    ) -> ServiceRuleCurrent:
        code = (service_code or "").strip()
        row = await self._repo.get_current_by_id(bundle_id)
        if row is None:
            row = await self._repo.get_current(code)
        if row is None:
            raise EntityNotFoundError("ServiceRuleCurrent", bundle_id)
        if row.service_code != code:
            raise InvalidInputError("service_code mismatch")
        return await self.upsert_draft(
            service_code=code,
            yaml_text=yaml_text,
            source_version=source_version,
            created_by=created_by,
        )

    async def get_active(self, service_code: str) -> ServiceRuleCurrent | None:
        return await self._repo.get_active_bundle(service_code)

    async def get_current(self, service_code: str) -> ServiceRuleCurrent | None:
        return await self._repo.get_current(service_code)

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
        self, service_code: str
    ) -> ServiceRuleCurrent | None:
        """Row used by the YAML editor (prefer draft content via properties)."""
        return await self._repo.get_current(service_code)

    async def apply_draft(
        self, *, service_code: str, applied_by: str | None = None
    ) -> ServiceRuleCurrent:
        code = (service_code or "").strip()
        row = await self._repo.get_current(code)
        if row is None:
            raise EntityNotFoundError("ServiceRuleCurrent", code)
        if not row.has_draft:
            raise InvalidInputError("적용할 작업본이 없습니다.")

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
        return row

    async def activate(self, bundle_id: int) -> ServiceRuleCurrent:
        """Compatibility: apply draft for the current row id."""
        row = await self._repo.get_current_by_id(bundle_id)
        if row is None:
            # If client still passes draft "bundle" id incorrectly, try as service lookup.
            raise EntityNotFoundError("ServiceRuleCurrent", bundle_id)
        return await self.apply_draft(
            service_code=row.service_code, applied_by=row.draft_updated_by
        )

    async def restore_from_history(
        self,
        *,
        service_code: str,
        history_id: int,
        restored_by: str | None = None,
    ) -> ServiceRuleCurrent:
        code = (service_code or "").strip()
        hist = await self._repo.get_history(history_id)
        if hist is None:
            raise EntityNotFoundError("ServiceRuleHistory", history_id)
        if hist.service_code != code:
            raise InvalidInputError("service_code mismatch")

        row = await self._repo.ensure_current(code)
        if row.has_applied:
            await self._repo.add_history(
                ServiceRuleHistory(
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
        return await self._repo.flush_current(row)

    async def rollback(
        self, *, service_code: str, to_version: int
    ) -> ServiceRuleCurrent:
        """Compatibility: treat to_version as history_id."""
        return await self.restore_from_history(
            service_code=service_code, history_id=to_version
        )

    async def list_versions(self, service_code: str) -> list[ServiceRuleHistory]:
        return await self._repo.list_history(service_code)

    async def list_versions_with_active_flag(
        self, service_code: str
    ) -> list[tuple[ServiceRuleHistory, bool]]:
        history = await self._repo.list_history(service_code)
        current = await self._repo.get_current(service_code)
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


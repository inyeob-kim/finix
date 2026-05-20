"""Business logic for DB-primary YAML rules (validate/version/activate/rollback)."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

import yaml

from app.utils.rule_input_omm_skeleton import merge_rule_inputs_with_skeleton

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.models.service_rule_bundle import ServiceRuleBundle
from app.repositories.service_rules_repo import ServiceRulesRepository


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
    """Insert $.error_code assertion when Error cases omit assertions key but define error_code."""
    rules = payload.get("rules")
    if not isinstance(rules, list):
        return payload
    for r in rules:
        if not isinstance(r, dict):
            continue
        rtype = str(r.get("rule_type") or "").strip()
        if rtype != "E":
            continue
        expect = r.get("expect")
        if not isinstance(expect, dict):
            continue
        error_code = expect.get("error_code")
        if not (isinstance(error_code, str) and error_code.strip()):
            continue
        had_assertions_key = "assertions" in r
        assertions = r.get("assertions")
        if assertions is None:
            r["assertions"] = []
            assertions = r["assertions"]
        if not isinstance(assertions, list):
            assertions = []
            r["assertions"] = assertions
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


def _validate_rules_structure(payload: dict[str, Any]) -> None:
    rules = payload.get("rules") or []
    if not isinstance(rules, list):
        raise InvalidInputError("YAML의 rules는 list 형태여야 합니다.")
    if not rules:
        raise InvalidInputError("YAML의 rules는 비어 있을 수 없습니다.")

    seen: set[str] = set()
    for idx, r in enumerate(rules):
        if not isinstance(r, dict):
            raise InvalidInputError(f"rules[{idx}]는 object(map) 형태여야 합니다.")

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
        if not (isinstance(title, str) and title.strip()):
            raise InvalidInputError(f"rules[{idx}].title이 필요합니다.")

        description = r.get("description")
        if not (isinstance(description, str) and description.strip()):
            raise InvalidInputError(f"rules[{idx}].description이 필요합니다.")

        rule_input = r.get("input")
        if not isinstance(rule_input, dict):
            raise InvalidInputError(f"rules[{idx}].input은 object(map) 형태여야 합니다.")

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
            if not (isinstance(error_code, str) and error_code.strip()):
                raise InvalidInputError(
                    f"rules[{idx}].expect.error_code가 필요합니다 (rule_type=E)."
                )
            if assertions:
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

    types_present = {str(r.get("rule_type")).strip() for r in rules if isinstance(r, dict)}
    missing = _RULE_TYPES - types_present
    if missing:
        raise InvalidInputError(f"rules에 필수 rule_type이 누락되었습니다: {sorted(missing)}")


def validate_and_prepare_yaml(
    yaml_text: str,
    *,
    input_skeleton: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any]]:
    """Parse YAML, normalize, auto-fix, validate structure, return canonical text."""
    payload = _parse_yaml_document(yaml_text)
    payload = normalize_legacy_rule_fields(payload)
    payload = normalize_duplicate_case_ids(payload)
    payload = truncate_source_evidence_snippets(payload)
    payload = autofill_missing_assertions(payload)
    if input_skeleton:
        merge_rule_inputs_with_skeleton(payload, input_skeleton)
    _validate_rules_structure(payload)
    canonical = yaml.dump(
        payload,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
    ).strip()
    return f"{canonical}\n", payload


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


def _bundle_display_status(bundle: ServiceRuleBundle, *, active_id: int | None) -> str:
    if active_id is not None and bundle.id == active_id:
        return "active"
    return (bundle.status or "draft").strip().lower()


def _aggregate_registry_rows(
    bundles: list[ServiceRuleBundle],
    pointers: dict[str, Any],
) -> list[ServiceRuleRegistryRow]:
    """Collapse bundles into one registry row per service_code."""
    by_code: dict[str, list[ServiceRuleBundle]] = {}
    for bundle in bundles:
        by_code.setdefault(bundle.service_code, []).append(bundle)

    rows: list[ServiceRuleRegistryRow] = []
    for code, svc_bundles in by_code.items():
        svc_bundles.sort(key=lambda b: b.version, reverse=True)
        ptr = pointers.get(code)
        active_id = getattr(ptr, "active_bundle_id", None) if ptr is not None else None
        approved_id = getattr(ptr, "approved_bundle_id", None) if ptr is not None else None
        active_bundle = next((b for b in svc_bundles if b.id == active_id), None)
        drafts = [
            b
            for b in svc_bundles
            if (b.status or "").strip().lower() == "draft"
        ]
        latest_draft = drafts[0] if drafts else None

        if latest_draft is not None:
            primary = latest_draft
            display_status = "draft"
        elif active_bundle is not None:
            primary = active_bundle
            display_status = "active"
        else:
            primary = svc_bundles[0]
            display_status = _bundle_display_status(primary, active_id=active_id)

        name = (primary.service_name_snapshot or "").strip() or code
        rows.append(
            ServiceRuleRegistryRow(
                service_code=code,
                service_name=name,
                source_version=primary.source_version,
                status=display_status,
                rules=_rule_count_from_bundle(primary),
                bundle_id=primary.id,
                bundle_version=primary.version,
                last_updated_at=primary.updated_at,
                last_updated_by=primary.created_by,
                is_active=active_id is not None and primary.id == active_id,
                version_count=len(svc_bundles),
                active_bundle_version=active_bundle.version if active_bundle else None,
                draft_bundle_version=latest_draft.version if latest_draft else None,
                has_approved=approved_id is not None,
            )
        )
    return rows


def _rule_count_from_bundle(bundle: ServiceRuleBundle) -> int:
    if not bundle.rules_json:
        return 0
    try:
        parsed = json.loads(bundle.rules_json)
    except Exception:  # noqa: BLE001
        return 0
    rules = parsed.get("rules") if isinstance(parsed, dict) else None
    return len(rules) if isinstance(rules, list) else 0


class ServiceRulesService:
    """Workflow for rule bundles."""

    def __init__(self, *, repo: ServiceRulesRepository) -> None:
        self._repo = repo

    async def list_registry(
        self,
        *,
        query: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ServiceRuleRegistryRow], int]:
        """Return one row per service (primary bundle = latest draft, else active)."""
        pointers = {p.service_code: p for p in await self._repo.list_all_pointers()}
        bundles = await self._repo.list_all_bundles(limit=5000, offset=0)
        rows = _aggregate_registry_rows(bundles, pointers)

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
            rows = [r for r in rows if r.draft_bundle_version is not None]
        elif st == "approved":
            rows = [r for r in rows if r.has_approved]
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

    async def create_draft(
        self,
        *,
        service_code: str,
        yaml_text: str,
        source_version: str | None,
        created_by: str | None,
    ) -> ServiceRuleBundle:
        code = (service_code or "").strip()
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        if not (yaml_text or "").strip():
            raise InvalidInputError("yaml_text가 비어있습니다.")

        canonical_yaml, parsed = validate_and_prepare_yaml(yaml_text)
        version = await self._repo.next_version(code)
        bundle = ServiceRuleBundle(
            service_code=code,
            service_name_snapshot=str(parsed.get("service_name") or "") or None,
            status="draft",
            version=version,
            source_version=(source_version or None),
            yaml_text=canonical_yaml,
            rules_json=json.dumps(parsed, ensure_ascii=False),
            checksum=_sha256_text(canonical_yaml),
            created_by=created_by,
        )
        return await self._repo.create_bundle(bundle)

    async def update_draft(
        self,
        *,
        service_code: str,
        bundle_id: int,
        yaml_text: str,
        source_version: str | None = None,
        created_by: str | None = None,
    ) -> ServiceRuleBundle:
        code = (service_code or "").strip()
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        if not (yaml_text or "").strip():
            raise InvalidInputError("yaml_text가 비어있습니다.")

        bundle = await self._repo.get_bundle(bundle_id)
        if bundle is None:
            raise EntityNotFoundError("ServiceRuleBundle", bundle_id)
        if bundle.service_code != code:
            raise InvalidInputError("service_code mismatch")
        if (bundle.status or "").strip().lower() != "draft":
            raise InvalidInputError(
                "draft 상태 번들만 덮어쓸 수 있습니다. 새 버전 만들기를 사용하세요."
            )

        canonical_yaml, parsed = validate_and_prepare_yaml(yaml_text)
        bundle.service_name_snapshot = str(parsed.get("service_name") or "") or None
        bundle.yaml_text = canonical_yaml
        bundle.rules_json = json.dumps(parsed, ensure_ascii=False)
        bundle.checksum = _sha256_text(canonical_yaml)
        if source_version is not None:
            bundle.source_version = source_version or None
        if created_by is not None:
            bundle.created_by = created_by
        return await self._repo.flush_bundle(bundle)

    async def list_versions(self, service_code: str) -> list[ServiceRuleBundle]:
        return await self._repo.list_versions(service_code)

    async def get_active(self, service_code: str) -> ServiceRuleBundle | None:
        return await self._repo.get_active_bundle(service_code)

    async def get_bundle(self, bundle_id: int) -> ServiceRuleBundle:
        bundle = await self._repo.get_bundle(bundle_id)
        if bundle is None:
            raise EntityNotFoundError("ServiceRuleBundle", bundle_id)
        return bundle

    async def approve(self, bundle_id: int) -> ServiceRuleBundle:
        bundle = await self._repo.get_bundle(bundle_id)
        if bundle is None:
            raise EntityNotFoundError("ServiceRuleBundle", bundle_id)
        bundle.status = "approved"
        await self._repo.set_approved(bundle.service_code, bundle.id)
        return bundle

    async def _promote_bundle_to_active(self, bundle: ServiceRuleBundle) -> ServiceRuleBundle:
        """Point service at bundle and ensure only one row has status=active."""
        code = bundle.service_code
        ptr = await self._repo.get_pointer(code)
        previous_id = ptr.active_bundle_id if ptr is not None else None
        if previous_id is not None and previous_id != bundle.id:
            previous = await self._repo.get_bundle(previous_id)
            if previous is not None and (previous.status or "").strip().lower() == "active":
                previous.status = "superseded"
                await self._repo.flush_bundle(previous)
        bundle.status = "active"
        await self._repo.set_active(code, bundle.id)
        refreshed = await self._repo.get_bundle(bundle.id)
        if refreshed is None:
            raise EntityNotFoundError("ServiceRuleBundle", bundle.id)
        return refreshed

    async def activate(self, bundle_id: int) -> ServiceRuleBundle:
        bundle = await self._repo.get_bundle(bundle_id)
        if bundle is None:
            raise EntityNotFoundError("ServiceRuleBundle", bundle_id)
        return await self._promote_bundle_to_active(bundle)

    async def rollback(self, *, service_code: str, to_version: int) -> ServiceRuleBundle:
        bundle = await self._repo.get_bundle_by_version(service_code=service_code, version=to_version)
        if bundle is None:
            raise EntityNotFoundError("ServiceRuleBundleVersion", f"{service_code}:{to_version}")
        return await self._promote_bundle_to_active(bundle)

    async def list_versions_with_active_flag(
        self, service_code: str
    ) -> list[tuple[ServiceRuleBundle, bool]]:
        """List bundles newest-first with is_active derived from the service pointer."""
        code = (service_code or "").strip()
        bundles = await self._repo.list_versions(code)
        ptr = await self._repo.get_pointer(code)
        active_id = ptr.active_bundle_id if ptr is not None else None
        return [(b, active_id is not None and b.id == active_id) for b in bundles]

    async def reconcile_active_statuses_for_service(self, service_code: str) -> int:
        """
        Align bundle.status with active_bundle_id (DB repair / migration).

        Returns number of bundle rows updated.
        """
        code = (service_code or "").strip()
        if not code:
            return 0
        bundles = await self._repo.list_versions(code)
        ptr = await self._repo.get_pointer(code)
        active_id = ptr.active_bundle_id if ptr is not None else None
        changed = 0
        for bundle in bundles:
            st = (bundle.status or "").strip().lower()
            if active_id is not None and bundle.id == active_id:
                if st != "active":
                    bundle.status = "active"
                    await self._repo.flush_bundle(bundle)
                    changed += 1
            elif st == "active":
                bundle.status = "superseded"
                await self._repo.flush_bundle(bundle)
                changed += 1
        return changed

    async def reconcile_all_active_statuses(self) -> dict[str, int]:
        """Repair every service: at most one status=active row, matching the pointer."""
        pointers = await self._repo.list_all_pointers()
        totals: dict[str, int] = {}
        for ptr in pointers:
            n = await self.reconcile_active_statuses_for_service(ptr.service_code)
            if n:
                totals[ptr.service_code] = n
        bundles = await self._repo.list_all_bundles(limit=50_000, offset=0)
        codes = {b.service_code for b in bundles}
        pointer_codes = {p.service_code for p in pointers}
        for code in sorted(codes - pointer_codes):
            n = await self.reconcile_active_statuses_for_service(code)
            if n:
                totals[code] = n
        return totals

    async def delete_bundle(self, *, service_code: str, bundle_id: int) -> None:
        code = (service_code or "").strip()
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        bundle = await self._repo.get_bundle(bundle_id)
        if bundle is None:
            raise EntityNotFoundError("ServiceRuleBundle", bundle_id)
        if bundle.service_code != code:
            raise InvalidInputError("service_code mismatch")
        deleted = await self._repo.delete_bundle(bundle_id)
        if not deleted:
            raise EntityNotFoundError("ServiceRuleBundle", bundle_id)

    def validate_yaml_text(self, *, yaml_text: str) -> dict[str, Any]:
        """Parse, normalize, and validate rules YAML without persisting."""
        if not (yaml_text or "").strip():
            raise InvalidInputError("yaml_text가 비어있습니다.")
        _, parsed = validate_and_prepare_yaml(yaml_text)
        return parsed


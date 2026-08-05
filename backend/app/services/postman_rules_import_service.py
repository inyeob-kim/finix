"""Orchestrate Postman collection import into service-rules drafts."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from app.core.exceptions import InvalidInputError
from app.domain.postman_collection_parse import (
    PostmanRequestCandidate,
    parse_collection_requests,
)
from app.domain.postman_environment import (
    format_substitute_notes,
    prepare_collection_for_import,
)
from app.domain.postman_rules_merge import (
    apply_create_plan,
    apply_merge_plan,
    reindex_candidates,
)
from app.domain.postman_rules_plans import CreatePlan, MergePlan
from app.domain.service_uri_match import match_service_code
from app.repositories.service_catalog_repo import ServiceCatalogRepository
from app.services.postman_rules_import_ai_service import PostmanRulesImportAiService
from app.services.service_rules_service import ServiceRulesService
from app.utils.finix_yaml_dump import dump_finix_yaml
from app.utils.rule_input_omm_skeleton import (
    build_input_skeleton_for_generation,
    skeleton_from_catalog_raw_json,
)

logger = logging.getLogger(__name__)


@dataclass
class UnmatchedRequest:
    name: str
    method: str
    path: str

    def as_dict(self) -> dict[str, str]:
        return {"name": self.name, "method": self.method, "path": self.path}


@dataclass
class ServiceImportResult:
    service_code: str
    mode: str
    engine: str
    draft_id: int
    diff: dict[str, Any]
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "service_code": self.service_code,
            "mode": self.mode,
            "engine": self.engine,
            "draft_id": self.draft_id,
            "diff": self.diff,
            "notes": list(self.notes),
        }


@dataclass
class ImportResult:
    services: list[ServiceImportResult]
    unmatched: list[UnmatchedRequest]
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "services": [s.as_dict() for s in self.services],
            "unmatched": [u.as_dict() for u in self.unmatched],
            "notes": list(self.notes),
        }


@dataclass
class _ServiceWork:
    code: str
    items: list[PostmanRequestCandidate]
    mode: str
    service_name: str
    skeleton: dict[str, Any]
    base_rules: list[dict[str, Any]]


class PostmanRulesImportService:
    """Parse Postman JSON, plan via AI (optional), upsert drafts."""

    def __init__(
        self,
        *,
        rules: ServiceRulesService,
        catalog: ServiceCatalogRepository,
        ai: PostmanRulesImportAiService | None = None,
    ) -> None:
        self._rules = rules
        self._catalog = catalog
        self._ai = ai

    async def import_collection(
        self,
        collection: Any,
        *,
        environment: Any | None = None,
        created_by: str | None = None,
        overwrite_draft: bool = False,
    ) -> ImportResult:
        try:
            prepared = prepare_collection_for_import(collection, environment)
        except ValueError as exc:
            raise InvalidInputError(str(exc)) from exc

        import_notes = format_substitute_notes(prepared)
        candidates = parse_collection_requests(prepared.document)
        if not candidates:
            raise InvalidInputError(
                "Postman Collection/Request에서 HTTP 요청을 찾지 못했습니다."
            )

        catalog_rows = await self._catalog.list(query=None, limit=5000, offset=0)
        catalog_uris = {
            r.service_code: (r.uri or "")
            for r in catalog_rows
            if r.service_code
        }
        catalog_by_code = {r.service_code: r for r in catalog_rows if r.service_code}

        groups: dict[str, list[PostmanRequestCandidate]] = {}
        unmatched: list[UnmatchedRequest] = []
        for c in candidates:
            code = match_service_code(path=c.path, catalog_uris=catalog_uris)
            if not code:
                unmatched.append(
                    UnmatchedRequest(name=c.name, method=c.method, path=c.path or "")
                )
                continue
            groups.setdefault(code, []).append(c)

        if not groups:
            return ImportResult(
                services=[], unmatched=unmatched, notes=import_notes
            )

        # Sequential DB reads / draft guard (AsyncSession is not concurrency-safe).
        work: list[_ServiceWork] = []
        blocked: list[str] = []
        for code, items in groups.items():
            current = await self._rules.get_current(code)
            if current is not None and current.has_draft and not overwrite_draft:
                blocked.append(code)
                continue
            row = catalog_by_code.get(code)
            service_name = (
                (row.service_name if row and row.service_name else None) or code
            )
            skeleton = self._skeleton_for(row)
            has_applied = bool(current and current.has_applied)
            mode = "merge" if has_applied else "create"
            base_rules: list[dict[str, Any]] = []
            if current is not None and current.has_applied and current.rules_json:
                try:
                    parsed = json.loads(current.rules_json)
                    rules = parsed.get("rules") if isinstance(parsed, dict) else None
                    if isinstance(rules, list):
                        base_rules = [r for r in rules if isinstance(r, dict)]
                except Exception:  # noqa: BLE001
                    base_rules = []
            work.append(
                _ServiceWork(
                    code=code,
                    # Remap collection-wide indices → 0..n-1 for this service group
                    # so AI plans and apply_create/merge share the same index space.
                    items=reindex_candidates(items),
                    mode=mode,
                    service_name=service_name,
                    skeleton=skeleton,
                    base_rules=base_rules,
                )
            )

        if blocked:
            raise InvalidInputError(
                "작업본이 있는 서비스가 있습니다. 덮어쓰려면 overwrite_draft=true 로 "
                f"다시 요청하세요: {', '.join(sorted(blocked))}"
            )
        if not work:
            return ImportResult(
                services=[], unmatched=unmatched, notes=import_notes
            )

        # Parallel LLM only (no DB).
        planned = await asyncio.gather(
            *[self._ai_plan(w) for w in work]
        )

        results: list[ServiceImportResult] = []
        for w, (engine, create_plan, merge_plan, notes) in zip(work, planned):
            if w.mode == "create":
                payload, diff = apply_create_plan(
                    service_code=w.code,
                    service_name=w.service_name,
                    candidates=w.items,
                    plan=create_plan,
                    skeleton=w.skeleton,
                )
            else:
                payload, diff = apply_merge_plan(
                    service_code=w.code,
                    service_name=w.service_name,
                    base_rules=w.base_rules,
                    candidates=w.items,
                    plan=merge_plan,
                    skeleton=w.skeleton,
                )

            yaml_text = dump_finix_yaml(payload.as_dict())
            draft = await self._rules.upsert_draft(
                service_code=w.code,
                yaml_text=yaml_text,
                source_version="postman_import",
                created_by=created_by,
            )
            results.append(
                ServiceImportResult(
                    service_code=w.code,
                    mode=w.mode,
                    engine=engine,
                    draft_id=draft.id,
                    diff=diff.as_dict(),
                    notes=list(diff.notes) + list(notes),
                )
            )
            logger.info(
                "postman_rules_import service=%s mode=%s engine=%s rules=%s",
                w.code,
                w.mode,
                engine,
                len(payload.rules),
            )

        return ImportResult(
            services=results, unmatched=unmatched, notes=import_notes
        )

    def _skeleton_for(self, row: Any) -> dict[str, Any]:
        raw = getattr(row, "raw_json", None) if row is not None else None
        skel = skeleton_from_catalog_raw_json(raw)
        if skel:
            return skel
        return build_input_skeleton_for_generation(
            in_dto=None,
            java_source=None,
            raw_catalog_json=raw,
            existing_yaml=None,
        )

    async def _ai_plan(
        self, w: _ServiceWork
    ) -> tuple[str, CreatePlan | None, MergePlan | None, list[str]]:
        notes: list[str] = []
        if self._ai is None:
            notes.append("LLM unavailable; used fallback plan")
            return "fallback", None, None, notes
        skeleton_keys = list(w.skeleton.keys())[:80]
        try:
            if w.mode == "create":
                plan = await self._ai.plan_create(
                    service_code=w.code,
                    service_name=w.service_name,
                    skeleton_keys=skeleton_keys,
                    candidates=w.items,
                )
                return "ai", plan, None, notes
            merge_plan = await self._ai.plan_merge(
                service_code=w.code,
                skeleton_keys=skeleton_keys,
                base_rules=w.base_rules,
                candidates=w.items,
            )
            return "ai", None, merge_plan, notes
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "postman_rules_import AI plan failed service=%s: %s",
                w.code,
                exc,
            )
            notes.append(f"AI plan failed; fallback ({type(exc).__name__})")
            return "fallback", None, None, notes

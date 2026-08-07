"""Orchestrate Postman collection import into service-rules drafts."""

from __future__ import annotations

import asyncio
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
from app.domain.postman_script_import import (
    ScriptVarIntent,
    build_script_import_plan,
    extract_script_assignments,
)
from app.domain.postman_rules_plans import (
    CreatePlan,
    MergePlan,
    POSTMAN_MATCH_INPUT_STRATEGY,
)
from app.domain.service_uri_match import match_service_code
from app.repositories.service_catalog_repo import ServiceCatalogRepository
from app.domain.collection_var_generators import summarize_generator_for_ai
from app.schemas.collection_var_generator_schema import (
    CollectionVarGeneratorCreateRequest,
)
from app.services.collection_var_generator_rag_service import (
    CollectionVarGeneratorRagService,
)
from app.services.collection_var_generator_service import CollectionVarGeneratorService
from app.services.postman_rules_import_ai_service import PostmanRulesImportAiService
from app.services.service_rules_service import ServiceRulesService
from app.utils.finix_yaml_dump import dump_finix_yaml
from app.utils.rule_input_omm_skeleton import (
    build_input_skeleton_for_generation,
    skeleton_from_catalog_raw_json,
)

logger = logging.getLogger(__name__)

_DEBUG_SAMPLE = 12


def _clip(text: str, limit: int = 120) -> str:
    raw = (text or "").replace("\n", " ").strip()
    if len(raw) <= limit:
        return raw
    return raw[: limit - 1] + "…"


def _format_intent_debug(intent: ScriptVarIntent) -> str:
    token = intent.finix_token or "-"
    return (
        f"{intent.name} kind={intent.kind} apply={intent.apply} "
        f"token={token} src={_clip(intent.source, 40)} "
        f"rhs={_clip(intent.rhs or intent.evidence, 80)}"
    )


def _log_intent_batch(label: str, intents: list[ScriptVarIntent]) -> None:
    if not logger.isEnabledFor(logging.DEBUG):
        return
    logger.debug(
        "postman_import [%s] intents=%s "
        "(auto=%s propose=%s review=%s unknown=%s)",
        label,
        len(intents),
        sum(1 for i in intents if i.apply == "auto"),
        sum(1 for i in intents if i.apply == "propose_only"),
        sum(1 for i in intents if i.apply == "needs_review"),
        sum(1 for i in intents if i.kind == "unknown"),
    )
    for intent in intents[:_DEBUG_SAMPLE]:
        logger.debug("postman_import [%s]  · %s", label, _format_intent_debug(intent))
    if len(intents) > _DEBUG_SAMPLE:
        logger.debug(
            "postman_import [%s]  · … +%s more",
            label,
            len(intents) - _DEBUG_SAMPLE,
        )

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
class MatchScan:
    """Env-substitute + parse + catalog match (no AI / no draft write)."""

    groups: dict[str, list[PostmanRequestCandidate]]
    unmatched: list[UnmatchedRequest]
    notes: list[str]
    catalog_by_code: dict[str, Any]
    request_count: int


@dataclass
class PreflightResult:
    matched_services: list[str]
    draft_services: list[str]
    unmatched: list[UnmatchedRequest]
    notes: list[str] = field(default_factory=list)
    request_count: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "matched_services": list(self.matched_services),
            "draft_services": list(self.draft_services),
            "unmatched": [u.as_dict() for u in self.unmatched],
            "notes": list(self.notes),
            "request_count": self.request_count,
        }


@dataclass
class _ServiceWork:
    code: str
    items: list[PostmanRequestCandidate]
    mode: str
    service_name: str
    skeleton: dict[str, Any]
    base_rules: list[dict[str, Any]]


def resolve_postman_import_mode(base_rules: list[dict[str, Any]] | None) -> str:
    """
    ``merge`` when editor already has cases (draft or applied);
    ``create`` only when there is no base to preserve.
    """
    return "merge" if base_rules else "create"


class PostmanRulesImportService:
    """Parse Postman JSON, plan via AI (optional), upsert drafts."""

    def __init__(
        self,
        *,
        rules: ServiceRulesService,
        catalog: ServiceCatalogRepository,
        ai: PostmanRulesImportAiService | None = None,
        generators: CollectionVarGeneratorService | None = None,
        generator_rag: CollectionVarGeneratorRagService | None = None,
    ) -> None:
        self._rules = rules
        self._catalog = catalog
        self._ai = ai
        self._generators = generators
        self._generator_rag = generator_rag

    async def _existing_catalog_summaries(self) -> list[dict[str, Any]]:
        if self._generators is None:
            return []
        try:
            listed = await self._generators.list_for_ui()
        except Exception as exc:  # noqa: BLE001
            logger.warning("postman_import list generators failed: %s", exc)
            return []
        out: list[dict[str, Any]] = []
        for item in listed.items:
            out.append(
                summarize_generator_for_ai(
                    key=item.key,
                    label=item.label,
                    impl_kind=item.impl_kind,
                    impl=item.impl,
                    description=item.description or item.hint or "",
                    source=item.source,
                )
            )
        return out

    async def _upsert_catalog_proposals(
        self,
        proposals: list[dict[str, Any]],
        *,
        created_by: str | None,
    ) -> list[str]:
        """Create/revive shared generators; return note lines."""
        if not proposals:
            return []
        if self._generators is None:
            return ["공유 생성기 서비스 없음 — catalog 적재 생략"]
        notes: list[str] = []
        created = 0
        for prop in proposals:
            try:
                await self._generators.create(
                    CollectionVarGeneratorCreateRequest(
                        key=str(prop["key"]),
                        label=str(prop.get("label") or prop["key"]),
                        description=str(prop.get("description") or ""),
                        prompt=str(prop.get("prompt") or "postman_import"),
                        impl_kind=str(prop["impl_kind"]),
                        impl=prop.get("impl") if isinstance(prop.get("impl"), dict) else {},
                        created_by=(created_by or "postman_import")[:64],
                    )
                )
                created += 1
            except Exception as exc:  # noqa: BLE001
                # Already exists or validation — continue import with token anyway.
                logger.info(
                    "postman_import catalog upsert key=%s: %s",
                    prop.get("key"),
                    exc,
                )
        if created:
            notes.append(f"공유 생성기 신규/복구 {created}건")
        elif proposals:
            notes.append(f"공유 생성기 후보 {len(proposals)}건 (기존 키 재사용 가능)")
        return notes
    async def _scan_match(
        self,
        collection: Any,
        environment: Any | None,
        *,
        inst_cd: str,
        extra_var_overrides: dict[str, str] | None = None,
    ) -> MatchScan:
        """Env (+ optional overrides) substitute → parse requests → catalog match."""
        try:
            prepared = prepare_collection_for_import(
                collection,
                environment,
                extra_var_overrides=extra_var_overrides,
            )
        except ValueError as exc:
            raise InvalidInputError(str(exc)) from exc

        notes = format_substitute_notes(prepared)
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

        return MatchScan(
            groups=groups,
            unmatched=unmatched,
            notes=notes,
            catalog_by_code=catalog_by_code,
            request_count=len(candidates),
        )

    async def _list_draft_services(
        self,
        service_codes: list[str],
        *,
        inst_cd: str,
    ) -> list[str]:
        drafts: list[str] = []
        for code in service_codes:
            if await self._rules.has_working_draft(code, inst_cd=inst_cd):
                drafts.append(code)
        return drafts

    async def preflight_collection(
        self,
        collection: Any,
        *,
        environment: Any | None = None,
        inst_cd: str,
    ) -> PreflightResult:
        """
        Parse/match only — report which matched services already have a draft.

        Does not run script AI or write drafts.
        """
        from app.domain.inst_scope import require_inst_cd

        inst = require_inst_cd(inst_cd)
        logger.info("postman_import preflight start inst=%s", inst)
        scan = await self._scan_match(collection, environment, inst_cd=inst)
        matched = sorted(scan.groups.keys())
        drafts = await self._list_draft_services(matched, inst_cd=inst)
        logger.info(
            "postman_import preflight matched=%s drafts=%s unmatched=%s requests=%s",
            len(matched),
            drafts,
            len(scan.unmatched),
            scan.request_count,
        )
        return PreflightResult(
            matched_services=matched,
            draft_services=drafts,
            unmatched=scan.unmatched,
            notes=list(scan.notes),
            request_count=scan.request_count,
        )

    async def import_collection(
        self,
        collection: Any,
        *,
        environment: Any | None = None,
        created_by: str | None = None,
        overwrite_draft: bool = False,
        inst_cd: str,
    ) -> ImportResult:
        from app.domain.inst_scope import require_inst_cd

        inst = require_inst_cd(inst_cd)
        logger.info(
            "postman_import start inst=%s overwrite_draft=%s has_env=%s",
            inst,
            overwrite_draft,
            environment is not None,
        )

        # --- Stage 0: light parse/match + draft guard (before script/AI work) ---
        logger.debug("postman_import [0/7] early match + draft guard")
        early = await self._scan_match(collection, environment, inst_cd=inst)
        if not early.groups:
            logger.info(
                "postman_import done: no matched services unmatched=%s",
                len(early.unmatched),
            )
            return ImportResult(
                services=[], unmatched=early.unmatched, notes=list(early.notes)
            )
        if not overwrite_draft:
            blocked = await self._list_draft_services(
                sorted(early.groups.keys()),
                inst_cd=inst,
            )
            if blocked:
                raise InvalidInputError(
                    "작업본이 있는 서비스가 있습니다. 덮어쓰려면 overwrite_draft=true 로 "
                    f"다시 요청하세요: {', '.join(blocked)}"
                )

        # --- Stage 1: extract script assignments (literals only auto) ---
        logger.debug("postman_import [1/7] script assignment extract")
        extracted_intents = extract_script_assignments(collection)
        _log_intent_batch("1 extract", extracted_intents)

        # --- Stage 2: RAG retrieve + AI classify/create ---
        ai_script_rows: list[dict[str, Any]] = []
        unknown_payload = [
            {
                "name": i.name,
                "source": i.source,
                "rhs": (i.rhs or i.evidence)[:400],
                "evidence": i.evidence,
                "related_bindings": i.related_bindings or {},
            }
            for i in extracted_intents
            if i.kind == "unknown" or i.apply == "needs_review"
        ]
        existing_catalog = await self._existing_catalog_summaries()
        if unknown_payload and self._generator_rag is not None:
            unknown_payload = await self._generator_rag.attach_candidates(
                unknown_payload,
                existing_catalog,
            )
        logger.debug(
            "postman_import [2/7] script AI classify candidates=%s ai=%s "
            "catalog=%s rag=%s",
            len(unknown_payload),
            self._ai is not None,
            len(existing_catalog),
            bool(self._generator_rag and self._generator_rag.available),
        )
        if unknown_payload and self._ai is not None:
            try:
                ai_script_rows = await self._ai.classify_script_intents(
                    unknown_payload,
                    existing_catalog=existing_catalog,
                    batch_size=12,
                )
                logger.debug(
                    "postman_import [2/7] AI returned rows=%s / asked=%s sample=%s",
                    len(ai_script_rows),
                    len(unknown_payload),
                    [
                        {
                            "name": r.get("name"),
                            "kind": r.get("kind"),
                            "token": r.get("finix_token"),
                            "apply": r.get("apply"),
                            "action": r.get("action"),
                        }
                        for r in ai_script_rows[:_DEBUG_SAMPLE]
                        if isinstance(r, dict)
                    ],
                )
                if len(ai_script_rows) < max(1, len(unknown_payload) // 2):
                    logger.warning(
                        "postman_import [2/7] AI coverage low returned=%s asked=%s",
                        len(ai_script_rows),
                        len(unknown_payload),
                    )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "postman_rules_import script AI classify failed: %s",
                    exc,
                )
        elif unknown_payload:
            logger.warning(
                "postman_import [2/7] skipped AI (no LLM); unknowns=%s",
                len(unknown_payload),
            )

        # --- Stage 3: merge plan / auto overrides / catalog upsert ---
        script_plan = build_script_import_plan(
            collection,
            ai_rows=ai_script_rows or None,
            intents=extracted_intents,
        )
        _log_intent_batch("3 plan", script_plan.intents)
        catalog_notes = await self._upsert_catalog_proposals(
            script_plan.catalog_proposals,
            created_by=created_by,
        )
        if logger.isEnabledFor(logging.DEBUG):
            overrides = script_plan.auto_overrides
            logger.debug(
                "postman_import [3/7] auto_overrides=%s proposals=%s sample=%s notes=%s",
                len(overrides),
                len(script_plan.catalog_proposals),
                {k: overrides[k] for k in list(overrides)[:_DEBUG_SAMPLE]},
                script_plan.notes,
            )

        # --- Stage 4–6: substitute (with script macros) + parse + match ---
        logger.debug("postman_import [4/7] prepare_collection_for_import")
        scan = await self._scan_match(
            collection,
            environment,
            inst_cd=inst,
            extra_var_overrides=script_plan.auto_overrides or None,
        )
        logger.debug(
            "postman_import [4-6/7] substituted notes=%s requests=%s "
            "matched=%s unmatched=%s",
            scan.notes,
            scan.request_count,
            len(scan.groups),
            len(scan.unmatched),
        )
        import_notes = (
            list(script_plan.notes) + list(catalog_notes) + list(scan.notes)
        )
        groups = scan.groups
        unmatched = scan.unmatched
        catalog_by_code = scan.catalog_by_code

        if not groups:
            logger.info(
                "postman_import done: no matched services unmatched=%s",
                len(unmatched),
            )
            return ImportResult(
                services=[], unmatched=unmatched, notes=import_notes
            )

        # Sequential DB reads (AsyncSession is not concurrency-safe).
        work: list[_ServiceWork] = []
        for code, items in groups.items():
            row = catalog_by_code.get(code)
            service_name = (
                (row.service_name if row and row.service_name else None) or code
            )
            skeleton = self._skeleton_for(row)
            # Prefer draft/applied editor base. Merge whenever any base cases exist
            # (draft-only from source→YAML must not be wiped by Postman create).
            base_rules = await self._rules.get_editor_base_rules(code, inst_cd=inst)
            mode = resolve_postman_import_mode(base_rules)
            if mode == "create":
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
            logger.debug(
                "postman_import [6/7] work · service=%s mode=%s "
                "candidates=%s base_rules=%s skeleton_keys=%s",
                code,
                mode,
                len(items),
                len(base_rules),
                len(skeleton),
            )

        if not work:
            return ImportResult(
                services=[], unmatched=unmatched, notes=import_notes
            )

        # --- Stage 7: AI create/merge + persist ---
        logger.debug(
            "postman_import [7/7] plan+persist services=%s",
            [w.code for w in work],
        )
        planned = await asyncio.gather(
            *[self._ai_plan(w) for w in work]
        )

        results: list[ServiceImportResult] = []
        for w, (engine, create_plan, merge_plan, notes) in zip(work, planned):
            if w.mode == "create":
                case_n = len(create_plan.cases) if create_plan else 0
                logger.debug(
                    "postman_import [7/7] apply create service=%s engine=%s cases=%s",
                    w.code,
                    engine,
                    case_n,
                )
                payload, diff = apply_create_plan(
                    service_code=w.code,
                    service_name=w.service_name,
                    candidates=w.items,
                    plan=create_plan,
                    skeleton=w.skeleton,
                )
            else:
                dec_n = len(merge_plan.decisions) if merge_plan else 0
                logger.debug(
                    "postman_import [7/7] apply merge service=%s engine=%s decisions=%s",
                    w.code,
                    engine,
                    dec_n,
                )
                payload, diff = apply_merge_plan(
                    service_code=w.code,
                    service_name=w.service_name,
                    base_rules=w.base_rules,
                    candidates=w.items,
                    plan=merge_plan,
                    skeleton=w.skeleton,
                    # Postman import: incoming request body is the curated source of truth.
                    match_input_strategy=POSTMAN_MATCH_INPUT_STRATEGY,
                )

            yaml_text = dump_finix_yaml(payload.as_dict())
            draft = await self._rules.upsert_draft(
                service_code=w.code,
                yaml_text=yaml_text,
                source_version="postman_import",
                created_by=created_by,
                inst_cd=inst,
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
                "postman_rules_import service=%s mode=%s engine=%s rules=%s draft_id=%s",
                w.code,
                w.mode,
                engine,
                len(payload.rules),
                draft.id,
            )
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(
                    "postman_import [7/7] draft service=%s yaml_chars=%s "
                    "diff_notes=%s",
                    w.code,
                    len(yaml_text),
                    list(diff.notes)[:8],
                )

        logger.info(
            "postman_import done services=%s unmatched=%s notes=%s",
            len(results),
            len(unmatched),
            import_notes,
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
            logger.debug(
                "postman_import [7/7] plan fallback service=%s (no LLM)",
                w.code,
            )
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
                logger.debug(
                    "postman_import [7/7] AI create plan service=%s cases=%s",
                    w.code,
                    len(plan.cases),
                )
                return "ai", plan, None, notes
            merge_plan = await self._ai.plan_merge(
                service_code=w.code,
                skeleton_keys=skeleton_keys,
                base_rules=w.base_rules,
                candidates=w.items,
            )
            logger.debug(
                "postman_import [7/7] AI merge plan service=%s decisions=%s",
                w.code,
                len(merge_plan.decisions),
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

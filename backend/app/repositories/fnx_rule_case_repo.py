"""Async repository for fnx_rule_svc / fnx_rule_case / fnx_rule_case_hist."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.inst_scope import require_inst_cd
from app.domain.rule_case_codec import (
    applied_rule_dict_from_row,
    assemble_yaml_from_rules,
    case_checksum_from_rule,
    draft_rule_dict_from_row,
    dumps_json,
    extract_rules_list,
    snapshot_json_for_rule,
    sort_order_for_rule,
)
from app.domain.yaml_rules_order import sort_rules_normal_then_error
from app.models.fnx_rule_case import FnxRuleCase
from app.models.fnx_rule_case_hist import FnxRuleCaseHist
from app.models.fnx_rule_svc import FnxRuleSvc
from app.models.fnx_rule_doc_current import ServiceRuleCurrent


class FnxRuleCaseRepository:
    """Data access for per-case rules and dual-write header sync."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_svc(
        self, svc_code: str, *, inst_cd: str
    ) -> FnxRuleSvc | None:
        code = (svc_code or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code:
            return None
        res = await self._session.execute(
            select(FnxRuleSvc).where(
                FnxRuleSvc.inst_cd == inst,
                FnxRuleSvc.svc_code == code,
            )
        )
        return res.scalar_one_or_none()

    async def ensure_svc(
        self, svc_code: str, *, inst_cd: str
    ) -> FnxRuleSvc:
        code = (svc_code or "").strip()
        inst = require_inst_cd(inst_cd)
        row = await self.get_svc(code, inst_cd=inst)
        if row is not None:
            return row
        row = FnxRuleSvc(inst_cd=inst, svc_code=code, yaml_text="", checksum="")
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return row

    async def list_cases(
        self, svc_code: str, *, inst_cd: str
    ) -> list[FnxRuleCase]:
        code = (svc_code or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code:
            return []
        stmt = (
            select(FnxRuleCase)
            .where(
                FnxRuleCase.inst_cd == inst,
                FnxRuleCase.svc_code == code,
            )
            .order_by(FnxRuleCase.sort_order.asc(), FnxRuleCase.rule_case_id.asc())
        )
        return list((await self._session.execute(stmt)).scalars().all())

    @staticmethod
    def is_case_applied(row: FnxRuleCase) -> bool:
        """True when the case has an applied (확정) snapshot."""
        return bool((row.checksum or "").strip())

    async def list_applied_cases(
        self, svc_code: str, *, inst_cd: str
    ) -> list[FnxRuleCase]:
        """Cases with applied content only (eligible for scenario attachment)."""
        return [
            row
            for row in await self.list_cases(svc_code, inst_cd=inst_cd)
            if FnxRuleCaseRepository.is_case_applied(row)
        ]

    async def list_svcs(self, *, inst_cd: str, limit: int = 5000) -> list[FnxRuleSvc]:
        """List service headers for one institution."""
        inst = require_inst_cd(inst_cd)
        stmt = (
            select(FnxRuleSvc)
            .where(FnxRuleSvc.inst_cd == inst)
            .order_by(FnxRuleSvc.updated_at.desc(), FnxRuleSvc.svc_code.asc())
            .limit(max(1, min(limit, 10_000)))
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def list_editor_rules(
        self, svc_code: str, *, inst_cd: str
    ) -> list[dict[str, Any]]:
        """
        Editor/merge base: prefer each case's draft, else applied.

        This is the institution-scoped rule list (SoT), not the shared façade.
        """
        rules: list[dict[str, Any]] = []
        for row in await self.list_cases(svc_code, inst_cd=inst_cd):
            draft = draft_rule_dict_from_row(row)
            if draft is not None:
                rules.append(draft)
                continue
            if (row.checksum or "").strip():
                rules.append(applied_rule_dict_from_row(row))
        if not rules:
            return []
        return sort_rules_normal_then_error({"rules": rules})["rules"]

    async def assemble_editor_yaml(
        self,
        *,
        svc_code: str,
        inst_cd: str,
        service_name: str | None = None,
        source_version: str | None = None,
    ) -> tuple[str, dict[str, Any]] | None:
        """Assemble working YAML from institution-scoped editor rules."""
        rules = await self.list_editor_rules(svc_code, inst_cd=inst_cd)
        if not rules:
            return None
        svc = await self.get_svc(svc_code, inst_cd=inst_cd)
        name = service_name or (svc.service_name_snapshot if svc else None)
        version = source_version
        if version is None and svc is not None:
            version = svc.draft_source_version or svc.source_version
        return assemble_yaml_from_rules(
            svc_code=svc_code,
            service_name=name,
            rules=rules,
            source_version=version,
        )

    async def has_any_draft(self, svc_code: str, *, inst_cd: str) -> bool:
        for row in await self.list_cases(svc_code, inst_cd=inst_cd):
            if draft_rule_dict_from_row(row) is not None:
                return True
        return False

    async def has_any_applied(self, svc_code: str, *, inst_cd: str) -> bool:
        for row in await self.list_cases(svc_code, inst_cd=inst_cd):
            if (row.checksum or "").strip():
                return True
        return False

    async def get_case_by_case_id(
        self, svc_code: str, case_id: str, *, inst_cd: str
    ) -> FnxRuleCase | None:
        code = (svc_code or "").strip()
        cid = (case_id or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code or not cid:
            return None
        res = await self._session.execute(
            select(FnxRuleCase).where(
                FnxRuleCase.inst_cd == inst,
                FnxRuleCase.svc_code == code,
                FnxRuleCase.rule_case_id == cid,
            )
        )
        return res.scalar_one_or_none()

    async def latest_hist_for_case(
        self,
        svc_code: str,
        case_id: str,
        *,
        inst_cd: str,
    ) -> FnxRuleCaseHist | None:
        code = (svc_code or "").strip()
        cid = (case_id or "").strip()
        inst = require_inst_cd(inst_cd)
        stmt = (
            select(FnxRuleCaseHist)
            .where(
                FnxRuleCaseHist.inst_cd == inst,
                FnxRuleCaseHist.svc_code == code,
                FnxRuleCaseHist.rule_case_id == cid,
            )
            .order_by(FnxRuleCaseHist.version.desc())
            .limit(1)
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def next_hist_version(
        self,
        svc_code: str,
        case_id: str,
        *,
        inst_cd: str,
    ) -> int:
        code = (svc_code or "").strip()
        cid = (case_id or "").strip()
        inst = require_inst_cd(inst_cd)
        res = await self._session.execute(
            select(func.coalesce(func.max(FnxRuleCaseHist.version), 0)).where(
                FnxRuleCaseHist.inst_cd == inst,
                FnxRuleCaseHist.svc_code == code,
                FnxRuleCaseHist.rule_case_id == cid,
            )
        )
        return int(res.scalar_one() or 0) + 1

    async def add_case_hist(
        self,
        *,
        rule_case: FnxRuleCase,
        rule: dict[str, Any],
        change_kind: str,
        created_by: str | None,
        note: str | None = None,
    ) -> FnxRuleCaseHist:
        version = await self.next_hist_version(
            rule_case.svc_code,
            rule_case.rule_case_id,
            inst_cd=rule_case.inst_cd,
        )
        checksum = case_checksum_from_rule(rule)
        hist = FnxRuleCaseHist(
            inst_cd=rule_case.inst_cd,
            svc_code=rule_case.svc_code,
            rule_case_id=rule_case.rule_case_id,
            version=version,
            change_kind=change_kind,
            snapshot_json=snapshot_json_for_rule(rule),
            checksum=checksum,
            note=note,
            created_by=created_by,
        )
        self._session.add(hist)
        await self._session.flush()
        await self._session.refresh(hist)
        return hist

    def _apply_draft_fields(
        self,
        row: FnxRuleCase,
        rule: dict[str, Any],
        *,
        updated_by: str | None,
        now: datetime,
    ) -> None:
        row.draft_rule_type = str(rule.get("rule_type") or "N").strip().upper() or "N"
        row.draft_title = str(rule.get("title") or "") or None
        row.draft_description = str(rule.get("description") or "") or None
        row.draft_input_json = dumps_json(rule.get("input") or {})
        row.draft_expect_json = dumps_json(rule.get("expect") or {})
        row.draft_assertions_json = dumps_json(rule.get("assertions") or [])
        row.draft_tags_json = dumps_json(rule.get("tags") or [])
        row.draft_evidence_json = dumps_json(rule.get("source_evidence") or {})
        extra = {}
        if "extract" in rule:
            extra["extract"] = rule.get("extract")
        if "use" in rule:
            extra["use"] = rule.get("use")
        row.draft_extra_json = dumps_json(extra) if extra else None
        folder = rule.get("folder")
        row.draft_folder = str(folder).strip() if folder else None
        row.draft_checksum = case_checksum_from_rule(rule)
        row.draft_updated_at = now
        row.draft_updated_by = updated_by

    def _apply_applied_fields(
        self,
        row: FnxRuleCase,
        rule: dict[str, Any],
        *,
        sort_order: int,
        updated_by: str | None,
    ) -> None:
        row.rule_type = str(rule.get("rule_type") or "N").strip().upper() or "N"
        row.title = str(rule.get("title") or "") or None
        row.description = str(rule.get("description") or "") or None
        row.input_json = dumps_json(rule.get("input") or {})
        row.expect_json = dumps_json(rule.get("expect") or {})
        row.assertions_json = dumps_json(rule.get("assertions") or [])
        row.tags_json = dumps_json(rule.get("tags") or [])
        row.evidence_json = dumps_json(rule.get("source_evidence") or {})
        extra = {}
        if "extract" in rule:
            extra["extract"] = rule.get("extract")
        if "use" in rule:
            extra["use"] = rule.get("use")
        row.extra_json = dumps_json(extra) if extra else None
        folder = rule.get("folder")
        row.folder = str(folder).strip() if folder else None
        row.sort_order = sort_order
        row.checksum = case_checksum_from_rule(rule)
        row.updated_by = updated_by

    async def refresh_applied_from_rule(
        self,
        *,
        svc_code: str,
        case_id: str,
        rule: dict[str, Any],
        updated_by: str | None = None,
        inst_cd: str,
        change_kind: str = "materialize_sync",
    ) -> FnxRuleCaseHist | None:
        """
        Update the applied (확정) snapshot from ``rule`` when the case is already applied.

        Draft fields are left intact. Used when rematerializing pool TCs so scenarios
        that resolve via applied rules see the same body without a separate 확정 click.
        """
        code = (svc_code or "").strip()
        cid = (case_id or "").strip()
        inst = require_inst_cd(inst_cd)
        row = await self.get_case_by_case_id(code, cid, inst_cd=inst)
        if row is None or not self.is_case_applied(row):
            return None
        prev_checksum = row.checksum or ""
        self._apply_applied_fields(
            row,
            rule,
            sort_order=row.sort_order,
            updated_by=updated_by,
        )
        hist: FnxRuleCaseHist | None = None
        if row.checksum != prev_checksum:
            hist = await self.add_case_hist(
                rule_case=row,
                rule=rule,
                change_kind=change_kind,
                created_by=updated_by,
                note=f"applied synced from TC materialize ({cid})",
            )
        await self._session.flush()
        return hist

    def _clear_draft_fields(self, row: FnxRuleCase) -> None:
        row.draft_input_json = None
        row.draft_expect_json = None
        row.draft_assertions_json = None
        row.draft_tags_json = None
        row.draft_evidence_json = None
        row.draft_extra_json = None
        row.draft_title = None
        row.draft_description = None
        row.draft_rule_type = None
        row.draft_folder = None
        row.draft_checksum = None
        row.draft_updated_at = None
        row.draft_updated_by = None

    async def sync_header_from_current(
        self,
        current: ServiceRuleCurrent,
        *,
        inst_cd: str,
    ) -> FnxRuleSvc:
        """Copy façade YAML columns from service_rules_current onto fnx_rule_svc."""
        inst = require_inst_cd(inst_cd)
        svc = await self.ensure_svc(current.service_code, inst_cd=inst)
        svc.service_name_snapshot = current.service_name_snapshot
        svc.source_version = current.source_version
        svc.yaml_text = current.yaml_text or ""
        svc.rules_json = current.rules_json
        svc.checksum = current.checksum or ""
        svc.draft_yaml_text = current.draft_yaml_text
        svc.draft_rules_json = current.draft_rules_json
        svc.draft_checksum = current.draft_checksum
        svc.draft_source_version = current.draft_source_version
        svc.draft_updated_at = current.draft_updated_at
        svc.draft_updated_by = current.draft_updated_by
        svc.updated_by = current.updated_by
        await self._session.flush()
        return svc

    async def upsert_draft_cases_from_payload(
        self,
        *,
        svc_code: str,
        parsed: dict[str, Any],
        updated_by: str | None,
        inst_cd: str,
    ) -> list[FnxRuleCase]:
        code = (svc_code or "").strip()
        inst = require_inst_cd(inst_cd)
        await self.ensure_svc(code, inst_cd=inst)
        ordered = sort_rules_normal_then_error(
            {"rules": extract_rules_list(parsed)}
        )["rules"]
        now = datetime.now(timezone.utc)
        existing = {
            c.rule_case_id: c for c in await self.list_cases(code, inst_cd=inst)
        }
        seen: set[str] = set()
        result: list[FnxRuleCase] = []

        for idx, rule in enumerate(ordered):
            if not isinstance(rule, dict):
                continue
            case_id = str(rule.get("case_id") or "").strip()
            if not case_id:
                continue
            seen.add(case_id)
            row = existing.get(case_id)
            if row is None:
                row = FnxRuleCase(
                    inst_cd=inst,
                    svc_code=code,
                    rule_case_id=case_id,
                    rule_type=str(rule.get("rule_type") or "N").strip().upper() or "N",
                    sort_order=sort_order_for_rule(rule, idx),
                    checksum="",
                )
                self._session.add(row)
                await self._session.flush()
                existing[case_id] = row
            row.sort_order = sort_order_for_rule(rule, idx)
            self._apply_draft_fields(row, rule, updated_by=updated_by, now=now)
            result.append(row)

        for case_id, row in list(existing.items()):
            if case_id in seen:
                continue
            if not (row.checksum or "").strip():
                await self._session.delete(row)
            else:
                self._clear_draft_fields(row)

        await self._session.flush()
        return result

    async def list_case_meta(
        self, svc_code: str, *, inst_cd: str
    ) -> list[dict[str, Any]]:
        """Per-case applied/draft flags for editor UI."""
        return [
            {
                "case_id": row.rule_case_id,
                "is_applied": self.is_case_applied(row),
                "has_draft": row.has_draft,
            }
            for row in await self.list_cases(svc_code, inst_cd=inst_cd)
        ]

    async def _apply_one_draft_case(
        self,
        row: FnxRuleCase,
        *,
        applied_by: str | None,
        change_kind: str,
        note: str,
    ) -> FnxRuleCaseHist | None:
        draft_rule = draft_rule_dict_from_row(row)
        if draft_rule is None:
            return None
        prev_checksum = (row.checksum or "").strip()
        self._apply_applied_fields(
            row,
            draft_rule,
            sort_order=row.sort_order,
            updated_by=applied_by,
        )
        self._clear_draft_fields(row)
        if row.checksum != prev_checksum or not prev_checksum:
            return await self.add_case_hist(
                rule_case=row,
                rule=draft_rule,
                change_kind=change_kind,
                created_by=applied_by,
                note=note,
            )
        return None

    async def apply_draft_case(
        self,
        *,
        svc_code: str,
        case_id: str,
        applied_by: str | None,
        change_kind: str = "apply_case",
        inst_cd: str,
    ) -> FnxRuleCaseHist | None:
        code = (svc_code or "").strip()
        cid = (case_id or "").strip()
        inst = require_inst_cd(inst_cd)
        row = await self.get_case_by_case_id(code, cid, inst_cd=inst)
        if row is None:
            return None
        hist = await self._apply_one_draft_case(
            row,
            applied_by=applied_by,
            change_kind=change_kind,
            note=f"applied case snapshot ({cid})",
        )
        await self._session.flush()
        return hist

    async def deactivate_applied_case(
        self,
        *,
        svc_code: str,
        case_id: str,
        updated_by: str | None,
        change_kind: str = "deactivate",
        inst_cd: str,
    ) -> FnxRuleCase | None:
        """Clear applied snapshot so the case is excluded from scenario attachment."""
        code = (svc_code or "").strip()
        cid = (case_id or "").strip()
        inst = require_inst_cd(inst_cd)
        row = await self.get_case_by_case_id(code, cid, inst_cd=inst)
        if row is None:
            return None
        if not self.is_case_applied(row):
            return row

        if not row.has_draft:
            applied_rule = applied_rule_dict_from_row(row)
            if applied_rule:
                now = datetime.now(timezone.utc)
                self._apply_draft_fields(
                    row,
                    applied_rule,
                    updated_by=updated_by,
                    now=now,
                )

        row.checksum = ""
        row.updated_by = updated_by
        await self._session.flush()
        return row

    async def apply_draft_cases(
        self,
        *,
        svc_code: str,
        applied_by: str | None,
        change_kind: str = "apply",
        inst_cd: str,
    ) -> list[FnxRuleCaseHist]:
        code = (svc_code or "").strip()
        inst = require_inst_cd(inst_cd)
        cases = await self.list_cases(code, inst_cd=inst)
        hists: list[FnxRuleCaseHist] = []
        for row in cases:
            hist = await self._apply_one_draft_case(
                row,
                applied_by=applied_by,
                change_kind=change_kind,
                note="applied case snapshot",
            )
            if hist is not None:
                hists.append(hist)
        await self._session.flush()
        return hists

    async def replace_applied_cases_from_payload(
        self,
        *,
        svc_code: str,
        parsed: dict[str, Any],
        updated_by: str | None,
        change_kind: str = "restore",
        clear_draft: bool = True,
        inst_cd: str,
    ) -> list[FnxRuleCaseHist]:
        code = (svc_code or "").strip()
        inst = require_inst_cd(inst_cd)
        await self.ensure_svc(code, inst_cd=inst)
        ordered = sort_rules_normal_then_error(
            {"rules": extract_rules_list(parsed)}
        )["rules"]
        existing = {
            c.rule_case_id: c for c in await self.list_cases(code, inst_cd=inst)
        }
        seen: set[str] = set()
        hists: list[FnxRuleCaseHist] = []

        for idx, rule in enumerate(ordered):
            if not isinstance(rule, dict):
                continue
            case_id = str(rule.get("case_id") or "").strip()
            if not case_id:
                continue
            seen.add(case_id)
            row = existing.get(case_id)
            if row is None:
                row = FnxRuleCase(
                    inst_cd=inst,
                    svc_code=code,
                    rule_case_id=case_id,
                    rule_type="N",
                    sort_order=idx,
                    checksum="",
                )
                self._session.add(row)
                await self._session.flush()
                existing[case_id] = row
            prev = (row.checksum or "").strip()
            self._apply_applied_fields(
                row,
                rule,
                sort_order=sort_order_for_rule(rule, idx),
                updated_by=updated_by,
            )
            if clear_draft:
                self._clear_draft_fields(row)
            if row.checksum != prev or not prev:
                hist = await self.add_case_hist(
                    rule_case=row,
                    rule=rule,
                    change_kind=change_kind,
                    created_by=updated_by,
                )
                hists.append(hist)

        for case_id, row in list(existing.items()):
            if case_id not in seen:
                await self._session.delete(row)

        await self._session.flush()
        return hists

    async def assemble_applied_yaml(
        self,
        *,
        svc_code: str,
        service_name: str | None = None,
        inst_cd: str,
        source_version: str | None = None,
    ) -> tuple[str, dict[str, Any]] | None:
        cases = await self.list_cases(svc_code, inst_cd=inst_cd)
        rules = [
            applied_rule_dict_from_row(c)
            for c in cases
            if (c.checksum or "").strip()
        ]
        if not rules:
            return None
        svc = await self.get_svc(svc_code, inst_cd=inst_cd)
        name = service_name or (svc.service_name_snapshot if svc else None)
        version = source_version
        if version is None and svc is not None:
            version = svc.source_version
        return assemble_yaml_from_rules(
            svc_code=svc_code,
            service_name=name,
            rules=rules,
            source_version=version,
        )

    async def map_case_ids_to_latest_hist(
        self, svc_code: str, *, inst_cd: str
    ) -> dict[str, tuple[FnxRuleCase, FnxRuleCaseHist | None]]:
        out: dict[str, tuple[FnxRuleCase, FnxRuleCaseHist | None]] = {}
        inst = require_inst_cd(inst_cd)
        for row in await self.list_cases(svc_code, inst_cd=inst):
            hist = await self.latest_hist_for_case(
                row.svc_code, row.rule_case_id, inst_cd=inst
            )
            out[row.rule_case_id] = (row, hist)
        return out

    async def delete_all_for_svc(
        self, svc_code: str, *, inst_cd: str
    ) -> None:
        code = (svc_code or "").strip()
        inst = require_inst_cd(inst_cd)
        if not code:
            return
        await self._session.execute(
            delete(FnxRuleCase).where(
                FnxRuleCase.inst_cd == inst,
                FnxRuleCase.svc_code == code,
            )
        )
        await self._session.flush()

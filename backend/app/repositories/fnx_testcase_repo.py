"""Async repository for fnx_testcase / fnx_testcase_hist."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.inst_scope import require_inst_cd
from app.models.fnx_testcase import FnxTestcase
from app.models.fnx_testcase_hist import FnxTestcaseHist


def _testcase_checksum(
    *,
    name: str,
    http_method: str | None,
    endpoint: str | None,
    request_body_json: str | None,
    expected_status: int | None,
    expected_body_json: str | None,
    assertions_json: str | None,
) -> str:
    payload = {
        "name": name,
        "http_method": http_method,
        "endpoint": endpoint,
        "request_body_json": request_body_json,
        "expected_status": expected_status,
        "expected_body_json": expected_body_json,
        "assertions_json": assertions_json,
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class FnxTestcaseRepository:
    """Natural-key CRUD for materialized HTTP test cases."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(
        self,
        *,
        inst_cd: str,
        svc_code: str,
        rule_case_id: str,
    ) -> FnxTestcase | None:
        inst = require_inst_cd(inst_cd)
        svc = (svc_code or "").strip()
        cid = (rule_case_id or "").strip()
        if not svc or not cid:
            return None
        res = await self._session.execute(
            select(FnxTestcase).where(
                FnxTestcase.inst_cd == inst,
                FnxTestcase.svc_code == svc,
                FnxTestcase.rule_case_id == cid,
            )
        )
        return res.scalar_one_or_none()

    async def list_for_service(
        self, svc_code: str, *, inst_cd: str
    ) -> list[FnxTestcase]:
        inst = require_inst_cd(inst_cd)
        svc = (svc_code or "").strip()
        if not svc:
            return []
        stmt = (
            select(FnxTestcase)
            .where(
                FnxTestcase.inst_cd == inst,
                FnxTestcase.svc_code == svc,
            )
            .order_by(FnxTestcase.rule_case_id.asc())
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def next_hist_version(
        self, *, inst_cd: str, svc_code: str, rule_case_id: str
    ) -> int:
        inst = require_inst_cd(inst_cd)
        res = await self._session.execute(
            select(func.coalesce(func.max(FnxTestcaseHist.version), 0)).where(
                FnxTestcaseHist.inst_cd == inst,
                FnxTestcaseHist.svc_code == svc_code,
                FnxTestcaseHist.rule_case_id == rule_case_id,
            )
        )
        return int(res.scalar_one() or 0) + 1

    async def upsert(
        self,
        *,
        inst_cd: str,
        svc_code: str,
        rule_case_id: str,
        name: str,
        http_method: str | None,
        endpoint: str | None,
        request_body_json: str | None,
        expected_status: int | None,
        expected_body_json: str | None,
        assertions_json: str | None = None,
        rule_case_hist_version: int | None = None,
        pool_sample_id: int | None = None,
        updated_by: str | None = None,
        change_kind: str = "materialize",
    ) -> FnxTestcase:
        """Upsert current TC and append hist when checksum changes."""
        inst = require_inst_cd(inst_cd)
        svc = (svc_code or "").strip()
        cid = (rule_case_id or "").strip()
        checksum = _testcase_checksum(
            name=name,
            http_method=http_method,
            endpoint=endpoint,
            request_body_json=request_body_json,
            expected_status=expected_status,
            expected_body_json=expected_body_json,
            assertions_json=assertions_json,
        )
        row = await self.get(inst_cd=inst, svc_code=svc, rule_case_id=cid)
        changed = row is None or (row.checksum or "") != checksum
        if row is None:
            row = FnxTestcase(
                inst_cd=inst,
                svc_code=svc,
                rule_case_id=cid,
                name=name,
                http_method=http_method,
                endpoint=endpoint,
                request_body_json=request_body_json,
                expected_status=expected_status,
                expected_body_json=expected_body_json,
                assertions_json=assertions_json,
                rule_case_hist_version=rule_case_hist_version,
                checksum=checksum,
                pool_sample_id=pool_sample_id,
                updated_by=updated_by,
            )
            self._session.add(row)
        else:
            row.name = name
            row.http_method = http_method
            row.endpoint = endpoint
            row.request_body_json = request_body_json
            row.expected_status = expected_status
            row.expected_body_json = expected_body_json
            row.assertions_json = assertions_json
            row.rule_case_hist_version = rule_case_hist_version
            row.checksum = checksum
            if pool_sample_id is not None:
                row.pool_sample_id = pool_sample_id
            row.updated_by = updated_by

        await self._session.flush()

        if changed:
            version = await self.next_hist_version(
                inst_cd=inst, svc_code=svc, rule_case_id=cid
            )
            snap: dict[str, Any] = {
                "name": name,
                "http_method": http_method,
                "endpoint": endpoint,
                "request_body_json": request_body_json,
                "expected_status": expected_status,
                "expected_body_json": expected_body_json,
                "assertions_json": assertions_json,
                "rule_case_hist_version": rule_case_hist_version,
            }
            hist = FnxTestcaseHist(
                inst_cd=inst,
                svc_code=svc,
                rule_case_id=cid,
                version=version,
                change_kind=change_kind,
                snapshot_json=json.dumps(snap, ensure_ascii=False),
                checksum=checksum,
                rule_case_hist_version=rule_case_hist_version,
                created_by=updated_by,
            )
            self._session.add(hist)
            await self._session.flush()

        await self._session.refresh(row)
        return row

    async def delete(
        self, *, inst_cd: str, svc_code: str, rule_case_id: str
    ) -> bool:
        row = await self.get(
            inst_cd=inst_cd, svc_code=svc_code, rule_case_id=rule_case_id
        )
        if row is None:
            return False
        await self._session.delete(row)
        await self._session.flush()
        return True

    async def delete_for_service(self, svc_code: str, *, inst_cd: str) -> int:
        rows = await self.list_for_service(svc_code, inst_cd=inst_cd)
        for row in rows:
            await self._session.delete(row)
        await self._session.flush()
        return len(rows)

    async def find_by_pool_sample_id(
        self, pool_sample_id: int, *, inst_cd: str | None = None
    ) -> FnxTestcase | None:
        inst = require_inst_cd(inst_cd) if inst_cd else None
        stmt = select(FnxTestcase).where(
            FnxTestcase.pool_sample_id == pool_sample_id
        )
        if inst is not None:
            stmt = stmt.where(FnxTestcase.inst_cd == inst)
        stmt = stmt.order_by(FnxTestcase.updated_at.desc()).limit(1)
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def list_by_keys(
        self,
        keys: list[tuple[str, str, str]],
    ) -> list[FnxTestcase]:
        """Load many TCs by (inst_cd, svc_code, rule_case_id); order follows keys."""
        out: list[FnxTestcase] = []
        for inst_cd, svc_code, rule_case_id in keys:
            row = await self.get(
                inst_cd=inst_cd, svc_code=svc_code, rule_case_id=rule_case_id
            )
            if row is not None:
                out.append(row)
        return out


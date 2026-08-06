"""Tests for fnx_rule_case codec, dual-write, and TC natural-key stamping."""

from __future__ import annotations

import asyncio
import json

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 ??register ORM mappers
from app.core.exceptions import InvalidInputError
from app.db.base import Base
from app.domain.inst_scope import DEFAULT_INST_CD
from app.domain.rule_case_codec import (
    applied_rule_dict_from_row,
    assemble_yaml_from_rules,
    case_checksum_from_rule,
    extract_rules_list,
)
from app.models.fnx_rule_case import FnxRuleCase
from app.models.fnx_rule_case_hist import FnxRuleCaseHist
from app.repositories.fnx_rule_case_repo import FnxRuleCaseRepository
from app.repositories.fnx_testcase_repo import FnxTestcaseRepository
from app.repositories.metadata_repo import MetadataRepository
from app.repositories.service_rules_repo import ServiceRulesRepository
from app.services.service_rules_service import (
    ServiceRulesService,
    validate_and_prepare_yaml,
)
from app.services.testcase_service import TestCaseService as RuleCaseTestCaseService
from tests.test_service_rules_validation import _case_rule

_VALID_YAML = f"""
service_code: CU008
service_name: Sample
rules:
{_case_rule("CU008-N-001", "N", tags='["business"]')}
{_case_rule("CU008-E-001", "E")}
"""

_VALID_YAML_V2 = f"""
service_code: CU008
service_name: Sample
rules:
{_case_rule("CU008-N-001", "N", tags='["business"]')}
{_case_rule("CU008-E-001", "E", error_code="ERR002")}
{_case_rule("CU008-E-002", "E")}
"""


def test_case_checksum_stable():
    rule = {
        "case_id": "CU008-E-001",
        "rule_type": "E",
        "title": "t",
        "description": "d",
        "input": {"a": 1},
        "expect": {"outcome": "error", "error_code": "E1"},
        "assertions": [],
        "tags": ["input"],
        "source_evidence": {"method": "m", "snippet": "s"},
    }
    assert case_checksum_from_rule(rule) == case_checksum_from_rule(dict(rule))


def test_assemble_roundtrip_preserves_case_ids():
    _, parsed = validate_and_prepare_yaml(_VALID_YAML)
    rules = extract_rules_list(parsed)
    yaml_text, rebuilt = assemble_yaml_from_rules(
        svc_code="CU008",
        service_name="Sample",
        rules=rules,
    )
    assert "CU008-E-001" in yaml_text
    assert "CU008-N-001" in yaml_text
    ids = [r["case_id"] for r in rebuilt["rules"]]
    assert ids.index("CU008-N-001") < ids.index("CU008-E-001")


async def _build_session() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    return factory()


async def _dual_write_apply_creates_case_hist() -> None:
    session = await _build_session()
    try:
        rules_repo = ServiceRulesRepository(session)
        case_repo = FnxRuleCaseRepository(session)
        svc = ServiceRulesService(repo=rules_repo, case_repo=case_repo)

        await svc.upsert_draft(service_code="CU008", yaml_text=_VALID_YAML, source_version="v1", created_by="qa", inst_cd=DEFAULT_INST_CD)
        cases = await case_repo.list_cases("CU008", inst_cd=DEFAULT_INST_CD)
        assert len(cases) == 2
        assert all(c.inst_cd == DEFAULT_INST_CD for c in cases)
        assert all(c.has_draft for c in cases)

        applied = await svc.apply_draft(service_code="CU008", applied_by="qa", inst_cd=DEFAULT_INST_CD)
        assert applied.has_applied
        assert not applied.has_draft

        cases = await case_repo.list_cases("CU008", inst_cd=DEFAULT_INST_CD)
        assert all((c.checksum or "").strip() for c in cases)
        assert all(not c.has_draft for c in cases)

        for c in cases:
            hist = await case_repo.latest_hist_for_case(c.svc_code, c.rule_case_id, inst_cd=DEFAULT_INST_CD)
            assert hist is not None
            assert hist.version == 1
            assert hist.inst_cd == DEFAULT_INST_CD

        await svc.upsert_draft(service_code="CU008", yaml_text=_VALID_YAML_V2, source_version="v2", created_by="qa", inst_cd=DEFAULT_INST_CD)
        await svc.apply_draft(service_code="CU008", applied_by="qa", inst_cd=DEFAULT_INST_CD)
        e001 = await case_repo.get_case_by_case_id("CU008", "CU008-E-001", inst_cd=DEFAULT_INST_CD)
        assert e001 is not None
        hist_e001 = await case_repo.latest_hist_for_case("CU008", "CU008-E-001", inst_cd=DEFAULT_INST_CD)
        assert hist_e001 is not None
        assert hist_e001.version >= 2
        e002 = await case_repo.get_case_by_case_id("CU008", "CU008-E-002", inst_cd=DEFAULT_INST_CD)
        assert e002 is not None
        hist_e002 = await case_repo.latest_hist_for_case("CU008", "CU008-E-002", inst_cd=DEFAULT_INST_CD)
        assert hist_e002 is not None
        assert hist_e002.version == 1

        # Same svc under another institution is isolated.
        await case_repo.upsert_draft_cases_from_payload(
            svc_code="CU008",
            parsed={"service_code": "CU008", "rules": extract_rules_list(
                validate_and_prepare_yaml(_VALID_YAML)[1]
            )},
            updated_by="qa",
            inst_cd="2002",
        )
        cases_a = await case_repo.list_cases("CU008", inst_cd=DEFAULT_INST_CD)
        cases_b = await case_repo.list_cases("CU008", inst_cd="2002")
        assert len(cases_a) == 3
        assert len(cases_b) == 2
    finally:
        await session.close()


def test_dual_write_apply_creates_case_hist():
    asyncio.run(_dual_write_apply_creates_case_hist())


async def _apply_single_draft_case_only() -> None:
    session = await _build_session()
    try:
        rules_repo = ServiceRulesRepository(session)
        case_repo = FnxRuleCaseRepository(session)
        svc = ServiceRulesService(repo=rules_repo, case_repo=case_repo)

        await svc.upsert_draft(
            service_code="CU008",
            yaml_text=_VALID_YAML,
            source_version="v1",
            created_by="qa",
            inst_cd=DEFAULT_INST_CD,
        )
        bundle = await svc.apply_draft_case(
            service_code="CU008",
            case_id="CU008-N-001",
            applied_by="qa",
            inst_cd=DEFAULT_INST_CD,
        )
        meta = {m["case_id"]: m for m in bundle["case_meta"]}
        assert meta["CU008-N-001"]["is_applied"] is True
        assert meta["CU008-N-001"]["has_draft"] is False
        assert meta["CU008-E-001"]["is_applied"] is False
        assert meta["CU008-E-001"]["has_draft"] is True

        applied = await case_repo.list_applied_cases("CU008", inst_cd=DEFAULT_INST_CD)
        assert [c.rule_case_id for c in applied] == ["CU008-N-001"]
    finally:
        await session.close()


def test_apply_single_draft_case_only():
    asyncio.run(_apply_single_draft_case_only())


async def _apply_single_draft_case_requires_pool_testcase() -> None:
    session = await _build_session()
    try:
        rules_repo = ServiceRulesRepository(session)
        case_repo = FnxRuleCaseRepository(session)
        tc_repo = FnxTestcaseRepository(session)
        svc = ServiceRulesService(
            repo=rules_repo, case_repo=case_repo, tc_repo=tc_repo
        )

        await svc.upsert_draft(
            service_code="CU008",
            yaml_text=_VALID_YAML,
            source_version="v1",
            created_by="qa",
            inst_cd=DEFAULT_INST_CD,
        )
        with pytest.raises(InvalidInputError, match="테스트케이스"):
            await svc.apply_draft_case(
                service_code="CU008",
                case_id="CU008-N-001",
                applied_by="qa",
                inst_cd=DEFAULT_INST_CD,
            )
    finally:
        await session.close()


def test_apply_single_draft_case_requires_pool_testcase():
    asyncio.run(_apply_single_draft_case_requires_pool_testcase())


async def _apply_single_draft_case_after_pool_materialize() -> None:
    session = await _build_session()
    try:
        rules_repo = ServiceRulesRepository(session)
        case_repo = FnxRuleCaseRepository(session)
        tc_repo = FnxTestcaseRepository(session)
        meta = MetadataRepository(session)
        rules_svc = ServiceRulesService(
            repo=rules_repo, case_repo=case_repo, tc_repo=tc_repo
        )
        tc_svc = RuleCaseTestCaseService(
            metadata_repo=meta,
            registry_repo=_FakeRegistry(),  # type: ignore[arg-type]
            cbs_catalog_repo=_FakeCbs(),  # type: ignore[arg-type]
            service_rules_repo=rules_repo,
            case_repo=case_repo,
            tc_repo=tc_repo,
        )

        await rules_svc.upsert_draft(
            service_code="CU008",
            yaml_text=_VALID_YAML,
            source_version="v1",
            created_by="qa",
            inst_cd=DEFAULT_INST_CD,
        )
        await tc_svc.materialize_one_case(
            "CU008",
            "CU008-N-001",
            inst_cd=DEFAULT_INST_CD,
        )
        bundle = await rules_svc.apply_draft_case(
            service_code="CU008",
            case_id="CU008-N-001",
            applied_by="qa",
            inst_cd=DEFAULT_INST_CD,
        )
        meta_by_id = {m["case_id"]: m for m in bundle["case_meta"]}
        assert meta_by_id["CU008-N-001"]["is_applied"] is True
        assert meta_by_id["CU008-N-001"]["has_pool_testcase"] is True
    finally:
        await session.close()


def test_apply_single_draft_case_after_pool_materialize():
    asyncio.run(_apply_single_draft_case_after_pool_materialize())


async def _activate_auto_materializes_missing_draft_cases() -> None:
    session = await _build_session()
    try:
        rules_repo = ServiceRulesRepository(session)
        case_repo = FnxRuleCaseRepository(session)
        tc_repo = FnxTestcaseRepository(session)
        meta = MetadataRepository(session)
        rules_svc = ServiceRulesService(
            repo=rules_repo, case_repo=case_repo, tc_repo=tc_repo
        )
        tc_svc = RuleCaseTestCaseService(
            metadata_repo=meta,
            registry_repo=_FakeRegistry(),  # type: ignore[arg-type]
            cbs_catalog_repo=_FakeCbs(),  # type: ignore[arg-type]
            service_rules_repo=rules_repo,
            case_repo=case_repo,
            tc_repo=tc_repo,
        )

        await rules_svc.upsert_draft(
            service_code="CU008",
            yaml_text=_VALID_YAML,
            source_version="v1",
            created_by="qa",
            inst_cd=DEFAULT_INST_CD,
        )
        created = await tc_svc.materialize_missing_draft_cases(
            "CU008", inst_cd=DEFAULT_INST_CD
        )
        assert len(created) == 2
        row = await rules_svc.apply_draft(
            service_code="CU008",
            applied_by="qa",
            inst_cd=DEFAULT_INST_CD,
        )
        assert row.has_applied is True
        assert row.has_draft is False
        applied = await case_repo.list_applied_cases("CU008", inst_cd=DEFAULT_INST_CD)
        assert {c.rule_case_id for c in applied} == {"CU008-N-001", "CU008-E-001"}
    finally:
        await session.close()


def test_activate_auto_materializes_missing_draft_cases():
    asyncio.run(_activate_auto_materializes_missing_draft_cases())


async def _deactivate_applied_case_only() -> None:
    session = await _build_session()
    try:
        rules_repo = ServiceRulesRepository(session)
        case_repo = FnxRuleCaseRepository(session)
        svc = ServiceRulesService(repo=rules_repo, case_repo=case_repo)

        await svc.upsert_draft(
            service_code="CU008",
            yaml_text=_VALID_YAML,
            source_version="v1",
            created_by="qa",
            inst_cd=DEFAULT_INST_CD,
        )
        await svc.apply_draft_case(
            service_code="CU008",
            case_id="CU008-N-001",
            applied_by="qa",
            inst_cd=DEFAULT_INST_CD,
        )
        bundle = await svc.deactivate_applied_case(
            service_code="CU008",
            case_id="CU008-N-001",
            inst_cd=DEFAULT_INST_CD,
        )
        meta = {m["case_id"]: m for m in bundle["case_meta"]}
        assert meta["CU008-N-001"]["is_applied"] is False
        assert meta["CU008-N-001"]["has_draft"] is True
        assert meta["CU008-E-001"]["has_draft"] is True

        applied = await case_repo.list_applied_cases("CU008", inst_cd=DEFAULT_INST_CD)
        assert applied == []
    finally:
        await session.close()


def test_deactivate_applied_case_only():
    asyncio.run(_deactivate_applied_case_only())


class _FakeCbs:
    async def get_by_service_code(self, code: str):
        return None


class _FakeRegistry:
    async def ensure_default_runner_stub(self) -> None:
        return None


async def _materialize_stamps_rule_case_fks() -> None:
    session = await _build_session()
    try:
        rules_repo = ServiceRulesRepository(session)
        case_repo = FnxRuleCaseRepository(session)
        meta = MetadataRepository(session)
        tc_repo = FnxTestcaseRepository(session)
        svc = ServiceRulesService(repo=rules_repo, case_repo=case_repo)
        await svc.upsert_draft(service_code="CU008", yaml_text=_VALID_YAML, source_version="v1", created_by="qa", inst_cd=DEFAULT_INST_CD)
        await svc.apply_draft(service_code="CU008", applied_by="qa", inst_cd=DEFAULT_INST_CD)

        tc_svc = RuleCaseTestCaseService(
            metadata_repo=meta,
            registry_repo=_FakeRegistry(),  # type: ignore[arg-type]
            cbs_catalog_repo=_FakeCbs(),  # type: ignore[arg-type]
            service_rules_repo=rules_repo,
            case_repo=case_repo,
            tc_repo=tc_repo,
        )
        created = await tc_svc.materialize_pool_for_service("CU008", inst_cd=DEFAULT_INST_CD)
        assert len(created) == 2
        for tc in created:
            assert tc.inst_cd == DEFAULT_INST_CD
            assert tc.svc_code == "CU008"
            assert tc.rule_case_id is not None
            assert tc.rule_case_hist_version is not None
            hist = await case_repo.latest_hist_for_case(
                "CU008", tc.rule_case_id, inst_cd=tc.inst_cd
            )
            assert hist is not None
            assert tc.rule_case_hist_version == hist.version
    finally:
        await session.close()


def test_materialize_stamps_rule_case_fks():
    asyncio.run(_materialize_stamps_rule_case_fks())


def test_applied_rule_dict_from_row_shape():
    row = FnxRuleCase(
        inst_cd=DEFAULT_INST_CD,
        svc_code="CU008",
        rule_case_id="CU008-E-001",
        rule_type="E",
        title="t",
        description="d",
        input_json=json.dumps({"x": 1}),
        expect_json=json.dumps({"outcome": "error"}),
        assertions_json=json.dumps([]),
        tags_json=json.dumps(["input"]),
        evidence_json=json.dumps({"method": "m", "snippet": "s"}),
        folder="E",
        checksum="abc",
    )
    rule = applied_rule_dict_from_row(row)
    assert rule["case_id"] == "CU008-E-001"
    assert rule["input"] == {"x": 1}
    assert rule["folder"] == "E"


def test_hist_natural_pk_fields():
    hist = FnxRuleCaseHist(
        inst_cd=DEFAULT_INST_CD,
        svc_code="CU008",
        rule_case_id="CU008-E-001",
        version=1,
        change_kind="apply",
        snapshot_json="{}",
        checksum="x",
    )
    assert hist.inst_cd == DEFAULT_INST_CD
    assert hist.version == 1

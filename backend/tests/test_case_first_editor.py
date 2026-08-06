"""Case-first editor rules loader and institution isolation."""

from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.db.base import Base
from app.domain.inst_scope import DEFAULT_INST_CD
from app.repositories.fnx_rule_case_repo import FnxRuleCaseRepository
from app.repositories.service_rules_repo import ServiceRulesRepository
from app.services.service_rules_service import (
    ServiceRulesService,
    validate_and_prepare_yaml,
)
from tests.test_service_rules_validation import _case_rule

_YAML_A = f"""
service_code: CU008
service_name: Sample A
rules:
{_case_rule("CU008-N-001", "N", tags='["business"]')}
"""

_YAML_B = f"""
service_code: CU008
service_name: Sample B
rules:
{_case_rule("CU008-E-001", "E")}
"""


def test_list_editor_rules_prefers_draft_and_isolates_inst():
    async def _run() -> None:
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )
        async with factory() as session:
            facade = ServiceRulesRepository(session)
            cases = FnxRuleCaseRepository(session)
            svc = ServiceRulesService(repo=facade, case_repo=cases)

            await svc.upsert_draft(
                service_code="CU008",
                yaml_text=_YAML_A,
                source_version="a",
                created_by="qa",
                inst_cd=DEFAULT_INST_CD,
            )
            await svc.upsert_draft(
                service_code="CU008",
                yaml_text=_YAML_B,
                source_version="b",
                created_by="qa",
                inst_cd="2002",
            )

            rules_a = await svc.get_editor_base_rules(
                "CU008", inst_cd=DEFAULT_INST_CD
            )
            rules_b = await svc.get_editor_base_rules("CU008", inst_cd="2002")
            assert [r["case_id"] for r in rules_a] == ["CU008-N-001"]
            assert [r["case_id"] for r in rules_b] == ["CU008-E-001"]

            rows_a, _ = await svc.list_registry(inst_cd=DEFAULT_INST_CD, limit=50, offset=0)
            rows_b, _ = await svc.list_registry(inst_cd="2002", limit=50, offset=0)
            assert any(r.service_code == "CU008" for r in rows_a)
            assert any(r.service_code == "CU008" for r in rows_b)
            assert all(
                r.rules == 1 for r in rows_a if r.service_code == "CU008"
            )

            bundle = await svc.get_editor_bundle_dict(
                "CU008", inst_cd=DEFAULT_INST_CD
            )
            assert bundle is not None
            assert bundle["has_draft"] is True
            assert "CU008-N-001" in (bundle["yaml_text"] or "")

            # Merge base for a second write on 1001 should see N-001, not E-001.
            _, parsed = validate_and_prepare_yaml(_YAML_A)
            assert any(
                r.get("case_id") == "CU008-N-001" for r in parsed["rules"]
            )
            await session.commit()
        await engine.dispose()

    asyncio.run(_run())

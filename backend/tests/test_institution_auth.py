"""Institution master, mock login, and active inst_cd checks."""

from __future__ import annotations

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register ORM mappers
from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.db.base import Base
from app.db.session import get_async_session
from app.domain.inst_scope import DEFAULT_INST_CD, require_inst_cd
from app.main import create_app
from app.repositories.institution_repo import InstitutionRepository
from app.services.institution_service import InstitutionService


def test_require_inst_cd_rejects_blank():
    with pytest.raises(InvalidInputError):
        require_inst_cd("  ")


def test_ensure_default_and_login():
    async def _run() -> None:
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )
        async with factory() as session:
            svc = InstitutionService(InstitutionRepository(session))
            row = await svc.ensure_default()
            assert row.inst_cd == DEFAULT_INST_CD
            await session.commit()

        async with factory() as session:
            svc = InstitutionService(InstitutionRepository(session))
            active = await svc.list_active()
            assert any(i["inst_cd"] == DEFAULT_INST_CD for i in active)

            login = await svc.login(
                username="qa.editor",
                role="qa.editor",
                inst_cd=DEFAULT_INST_CD,
            )
            assert login["inst_cd"] == DEFAULT_INST_CD
            assert login["inst_nm"]
            assert login["username"] == "qa.editor"

            with pytest.raises(EntityNotFoundError):
                await svc.login(
                    username="qa.editor",
                    role="qa.editor",
                    inst_cd="9999",
                )

            created = await svc.create(
                inst_cd="2002",
                inst_nm="테스트 기관",
                is_active=False,
            )
            assert created["inst_cd"] == "2002"
            with pytest.raises(InvalidInputError):
                await svc.assert_active("2002")

            await svc.create(inst_cd="3003", inst_nm="활성 기관", is_active=True)
            assert await svc.assert_active("3003") == "3003"
            await session.commit()

    asyncio.run(_run())


def test_login_rejects_bad_role():
    async def _run() -> None:
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )
        async with factory() as session:
            svc = InstitutionService(InstitutionRepository(session))
            await svc.ensure_default()
            with pytest.raises(InvalidInputError):
                await svc.login(
                    username="x",
                    role="admin",
                    inst_cd=DEFAULT_INST_CD,
                )
            await session.commit()

    asyncio.run(_run())


def test_institutions_and_login_api():
    async def _run() -> None:
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
        )

        async def _override_session():
            async with factory() as session:
                try:
                    yield session
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise

        app = create_app()
        app.dependency_overrides[get_async_session] = _override_session

        async with factory() as session:
            await InstitutionService(InstitutionRepository(session)).ensure_default()
            await session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            listed = await client.get("/api/v1/institutions")
            assert listed.status_code == 200
            body = listed.json()
            assert body["total"] >= 1
            assert any(i["inst_cd"] == DEFAULT_INST_CD for i in body["items"])

            bad = await client.post(
                "/api/v1/auth/login",
                json={
                    "username": "qa.editor",
                    "role": "qa.editor",
                    "inst_cd": "nope",
                },
            )
            assert bad.status_code == 404

            ok = await client.post(
                "/api/v1/auth/login",
                json={
                    "username": "qa.editor",
                    "role": "qa.editor",
                    "inst_cd": DEFAULT_INST_CD,
                },
            )
            assert ok.status_code == 200
            data = ok.json()
            assert data["inst_cd"] == DEFAULT_INST_CD
            assert data["role"] == "qa.editor"

            missing = await client.get("/api/v1/service-rules/registry")
            assert missing.status_code == 422

            scoped = await client.get(
                f"/api/v1/service-rules/registry?inst_cd={DEFAULT_INST_CD}"
            )
            assert scoped.status_code == 200

            unknown_inst = await client.get(
                "/api/v1/service-rules/registry?inst_cd=9999"
            )
            assert unknown_inst.status_code == 404

        app.dependency_overrides.clear()
        await engine.dispose()

    asyncio.run(_run())

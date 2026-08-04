"""Tests for collection var generators + catalog service."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

from app.domain.collection_var_generators import (
    CatalogGeneratorSpec,
    resolve_date_offset,
    resolve_start_var_value,
    validate_custom_impl,
)
from app.schemas.collection_var_generator_schema import (
    CollectionVarGeneratorCreateRequest,
)
from app.services.collection_var_generator_service import CollectionVarGeneratorService


def test_date_offset_months():
    impl = validate_custom_impl(
        "date_offset",
        {"unit": "months", "n": 3, "format": "YYYYMMDD"},
    )
    value = resolve_date_offset(impl)
    assert len(value) == 8
    assert value.isdigit()


def test_resolve_uses_catalog_for_shared_key():
    catalog = {
        "date_plus_3_months": CatalogGeneratorSpec(
            key="date_plus_3_months",
            impl_kind="date_offset",
            impl={"unit": "months", "n": 3, "format": "YYYYMMDD"},
        ),
    }
    out = resolve_start_var_value(
        value="",
        generator="date_plus_3_months",
        catalog=catalog,
    )
    assert len(out) == 8


def test_heuristic_draft_parses_korean_months():
    svc = CollectionVarGeneratorService(repo=MagicMock(), llm=None)
    draft = svc._heuristic_draft("오늘로부터 3개월 뒤 날짜 YYYYMMDD")
    assert draft.impl_kind == "date_offset"
    assert draft.impl["n"] == 3
    assert draft.impl["unit"] == "months"
    assert draft.sample_preview


def test_create_persists_shared_generator():
    repo = MagicMock()
    repo.get_by_key = AsyncMock(return_value=None)
    created = []

    async def _create(row):
        created.append(row)
        return row

    repo.create = AsyncMock(side_effect=_create)
    svc = CollectionVarGeneratorService(repo=repo, llm=None)
    result = asyncio.run(
        svc.create(
            CollectionVarGeneratorCreateRequest(
                key="date_plus_3_months",
                label="3개월 후",
                prompt="3개월 뒤",
                impl_kind="date_offset",
                impl={"unit": "months", "n": 3, "format": "YYYYMMDD"},
            ),
        ),
    )
    assert result.key == "date_plus_3_months"
    assert result.source == "shared"
    assert created
    assert created[0].impl_kind == "date_offset"


def test_preview_by_builtin_key():
    svc = CollectionVarGeneratorService(repo=MagicMock(), llm=None)
    out = asyncio.run(svc.preview(key="today_yyyymmdd"))
    assert len(out.value) == 8
    assert out.value.isdigit()


def test_preview_by_impl():
    svc = CollectionVarGeneratorService(repo=MagicMock(), llm=None)
    out = asyncio.run(
        svc.preview(
            impl_kind="date_offset",
            impl={"unit": "months", "n": 3, "format": "YYYYMMDD"},
        ),
    )
    assert len(out.value) == 8


def test_delete_deactivates_shared():
    row = MagicMock()
    row.status = "active"
    row.key = "date_plus_3_months"
    repo = MagicMock()
    repo.deactivate = AsyncMock(return_value=row)
    svc = CollectionVarGeneratorService(repo=repo, llm=None)
    asyncio.run(svc.delete("date_plus_3_months"))
    repo.deactivate.assert_awaited_once_with("date_plus_3_months")


def test_delete_rejects_builtin():
    svc = CollectionVarGeneratorService(repo=MagicMock(), llm=None)
    try:
        asyncio.run(svc.delete("today_yyyymmdd"))
        raise AssertionError("expected InvalidInputError")
    except Exception as exc:
        assert "내장" in str(exc)

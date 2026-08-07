"""Tests for collection var generators + catalog service."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

from app.domain.collection_var_generators import (
    CatalogGeneratorSpec,
    resolve_date_offset,
    resolve_start_var_value,
    split_generator_ref,
    validate_custom_impl,
)
from app.schemas.collection_var_generator_schema import (
    CollectionVarGeneratorCreateRequest,
)
from app.services.collection_var_generator_service import CollectionVarGeneratorService


def test_normalize_generator_naming_rejects_var_labels():
    from app.domain.collection_var_generators import normalize_generator_naming

    key, label = normalize_generator_naming(
        key="actorId",
        label="actorId",
        impl_kind="random_digits",
        impl={"length": 12},
    )
    assert key == "random_digits_12"
    assert label == "난수 12자리"

    names = ["James", "Maria", "Omar", "Linda", "Robert", "Susan"]
    key2, label2 = normalize_generator_naming(
        key="english_name_78f7b6",
        label="enName",
        impl_kind="pick_from_list",
        impl={"values": names},
        alias="firstNames",
    )
    assert key2 == "english_name"
    assert "영문" in label2

    key3, label3 = normalize_generator_naming(
        key="list_pick_deadbeef",
        label="이름 목록 랜덤(30개)",
        impl_kind="pick_from_list",
        impl={"values": names},
        alias="lastNames",
    )
    assert key3 == "english_name"
    assert "영문" in label3

    # Explicit AI/capability keys are kept.
    key4, label4 = normalize_generator_naming(
        key="english_first_name",
        label="영문 이름(이름)",
        impl_kind="pick_from_list",
        impl={"values": names},
    )
    assert key4 == "english_first_name"
    assert "영문" in label4


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
    draft = svc._heuristic_draft("오늘로부터 3개월 뒤 날짜 YYYYMMDD", [])
    assert draft.impl_kind == "date_offset"
    assert draft.impl["n"] == 3
    assert draft.impl["unit"] == "months"
    assert draft.sample_preview
    assert draft.has_draft


def test_pick_from_list_validate_and_resolve():
    from app.domain.collection_var_generators import resolve_catalog_spec

    impl = validate_custom_impl(
        "pick_from_list",
        {"values": ["Ada", "Bob", "Ada", ""]},
    )
    assert impl["values"] == ["Ada", "Bob"]
    value = resolve_catalog_spec(
        CatalogGeneratorSpec(key="names", impl_kind="pick_from_list", impl=impl),
    )
    assert value in ("Ada", "Bob")


def test_heuristic_english_name_uses_pick_from_list_not_digits():
    from app.schemas.collection_var_generator_schema import (
        CollectionVarGeneratorRead,
    )

    existing = [
        CollectionVarGeneratorRead(
            key="korean_name",
            label="한글 이름",
            source="builtin",
            impl_kind="korean_name",
        ),
        CollectionVarGeneratorRead(
            key="random_digits",
            label="난수 숫자",
            source="builtin",
            impl_kind="random_digits",
        ),
    ]
    svc = CollectionVarGeneratorService(repo=MagicMock(), llm=None)
    draft = svc._heuristic_draft("랜덤 영어 이름 만들어줘", existing)
    assert draft.has_draft
    assert draft.impl_kind == "pick_from_list"
    assert len(draft.impl.get("values") or []) >= 2
    assert draft.sample_preview
    assert not draft.sample_preview.isdigit()


def test_heuristic_korean_name_recommends_builtin():
    from app.schemas.collection_var_generator_schema import (
        CollectionVarGeneratorRead,
    )

    existing = [
        CollectionVarGeneratorRead(
            key="korean_name",
            label="한글 이름",
            source="builtin",
            impl_kind="korean_name",
        ),
    ]
    svc = CollectionVarGeneratorService(repo=MagicMock(), llm=None)
    draft = svc._heuristic_draft("한글 이름 랜덤", existing)
    assert not draft.has_draft
    assert len(draft.recommendations) == 1
    assert draft.recommendations[0].key == "korean_name"


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


def test_update_shared_impl():
    row = MagicMock()
    row.key = "date_plus_3_months"
    row.status = "active"
    row.label = "3개월 후"
    row.description = ""
    row.prompt = "x"
    row.impl_kind = "date_offset"
    row.impl_json = '{"unit":"months","n":3,"format":"YYYYMMDD"}'
    row.created_by = ""
    row.created_at = None
    repo = MagicMock()
    repo.get_by_key = AsyncMock(return_value=row)
    repo.save = AsyncMock(return_value=row)
    svc = CollectionVarGeneratorService(repo=repo, llm=None)
    from app.schemas.collection_var_generator_schema import (
        CollectionVarGeneratorUpdateRequest,
    )

    out = asyncio.run(
        svc.update(
            "date_plus_3_months",
            CollectionVarGeneratorUpdateRequest(
                impl={"unit": "months", "n": 6, "format": "YYYYMMDD"},
            ),
        ),
    )
    assert out.impl["n"] == 6
    assert row.impl_kind == "date_offset"
    repo.save.assert_awaited()


def test_split_generator_ref_and_shared_name_parts():
    assert split_generator_ref("korean_name.family") == ("korean_name", "family")
    assert split_generator_ref("korean_name") == ("korean_name", None)
    cache: dict = {}
    family = resolve_start_var_value(
        value="", generator="korean_name.family", resolve_cache=cache
    )
    given = resolve_start_var_value(
        value="", generator="korean_name.given", resolve_cache=cache
    )
    full = resolve_start_var_value(
        value="", generator="korean_name", resolve_cache=cache
    )
    assert full == family + given
    assert family
    assert given


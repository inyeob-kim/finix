"""Service for shared collection-variable generators."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.core.exceptions import InvalidInputError
from app.domain.collection_var_generators import (
    BUILTIN_META,
    CatalogGeneratorSpec,
    is_valid_generator_key,
    parse_impl_json,
    resolve_catalog_spec,
    resolve_start_var_value,
    validate_custom_impl,
)
from app.integrations.llm_client import LlmClient
from app.models.collection_var_generator import CollectionVarGenerator
from app.prompts.collection_var_generator_prompt import (
    PROMPT_VERSION,
    SYSTEM_PROMPT,
    build_user_prompt,
)
from app.repositories.collection_var_generator_repo import (
    CollectionVarGeneratorRepository,
)
from app.schemas.collection_var_generator_schema import (
    CollectionVarGeneratorCreateRequest,
    CollectionVarGeneratorDraftRead,
    CollectionVarGeneratorListRead,
    CollectionVarGeneratorPreviewRead,
    CollectionVarGeneratorRead,
)

logger = logging.getLogger(__name__)


def _strip_json_fences(text: str) -> str:
    t = (text or "").strip().replace("\r\n", "\n")
    t = re.sub(r"^```[a-zA-Z0-9_-]*\n", "", t)
    t = re.sub(r"\n```$", "", t)
    return t.strip()


def _row_to_spec(row: CollectionVarGenerator) -> CatalogGeneratorSpec:
    return CatalogGeneratorSpec(
        key=row.key,
        impl_kind=row.impl_kind,
        impl=parse_impl_json(row.impl_json),
    )


class CollectionVarGeneratorService:
    def __init__(
        self,
        *,
        repo: CollectionVarGeneratorRepository,
        llm: LlmClient | None,
    ) -> None:
        self._repo = repo
        self._llm = llm

    async def list_for_ui(self) -> CollectionVarGeneratorListRead:
        builtins = [
            CollectionVarGeneratorRead(
                key=key,
                label=label,
                description=hint,
                hint=hint,
                source="builtin",
                impl_kind=key,
            )
            for key, label, hint in BUILTIN_META
        ]
        shared_rows = await self._repo.list_active()
        shared = [
            CollectionVarGeneratorRead(
                key=r.key,
                label=r.label,
                description=r.description or "",
                hint=r.description or r.prompt[:80],
                source="shared",
                impl_kind=r.impl_kind,
                impl=parse_impl_json(r.impl_json),
                prompt=r.prompt,
                created_by=r.created_by or None,
                created_at=r.created_at,
            )
            for r in shared_rows
        ]
        return CollectionVarGeneratorListRead(items=[*builtins, *shared])

    async def build_catalog_map(self) -> dict[str, CatalogGeneratorSpec]:
        rows = await self._repo.list_active()
        return {r.key: _row_to_spec(r) for r in rows}

    async def preview(
        self,
        *,
        key: str | None = None,
        impl_kind: str | None = None,
        impl: dict[str, Any] | None = None,
    ) -> CollectionVarGeneratorPreviewRead:
        catalog_key = (key or "").strip()
        if catalog_key:
            builtin_keys = {m[0] for m in BUILTIN_META}
            if catalog_key in builtin_keys:
                value = resolve_start_var_value(value="", generator=catalog_key)
                return CollectionVarGeneratorPreviewRead(value=value)

            catalog = await self.build_catalog_map()
            if catalog_key in catalog:
                value = resolve_catalog_spec(catalog[catalog_key])
                return CollectionVarGeneratorPreviewRead(value=value)

            row = await self._repo.get_by_key(catalog_key)
            if row is None or row.status != "active":
                raise InvalidInputError(f"알 수 없는 생성기: {catalog_key}")
            value = resolve_catalog_spec(_row_to_spec(row))
            return CollectionVarGeneratorPreviewRead(value=value)

        kind = (impl_kind or "").strip()
        if not kind:
            raise InvalidInputError("key 또는 impl_kind 가 필요합니다.")
        try:
            normalized = validate_custom_impl(kind, impl or {})
        except ValueError as exc:
            raise InvalidInputError(str(exc)) from exc
        value = resolve_catalog_spec(
            CatalogGeneratorSpec(key="preview", impl_kind=kind, impl=normalized),
        )
        return CollectionVarGeneratorPreviewRead(value=value)

    async def draft_from_prompt(self, prompt: str) -> CollectionVarGeneratorDraftRead:
        text = (prompt or "").strip()
        if len(text) < 3:
            raise InvalidInputError("프롬프트를 입력하세요.")

        if self._llm is not None:
            try:
                return await self._llm_draft(text)
            except Exception as exc:  # noqa: BLE001
                logger.warning("generator AI draft failed: %s", exc)

        return self._heuristic_draft(text)

    async def _llm_draft(self, prompt: str) -> CollectionVarGeneratorDraftRead:
        assert self._llm is not None
        raw = await self._llm.complete_json(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=build_user_prompt(prompt),
        )
        data = json.loads(_strip_json_fences(raw))
        if not isinstance(data, dict):
            raise InvalidInputError("LLM JSON 형식이 올바르지 않습니다.")
        key = str(data.get("key") or "").strip().lower()
        label = str(data.get("label") or "").strip()
        description = str(data.get("description") or "").strip()
        impl_kind = str(data.get("impl_kind") or "").strip()
        impl_raw = data.get("impl") if isinstance(data.get("impl"), dict) else {}
        if not is_valid_generator_key(key):
            raise InvalidInputError("생성기 key 형식이 올바르지 않습니다.")
        if not label:
            raise InvalidInputError("생성기 label 이 비어 있습니다.")
        impl = validate_custom_impl(impl_kind, impl_raw)
        sample = resolve_catalog_spec(
            CatalogGeneratorSpec(key=key, impl_kind=impl_kind, impl=impl),
        )
        logger.info("collection_var_generator draft ok version=%s key=%s", PROMPT_VERSION, key)
        return CollectionVarGeneratorDraftRead(
            key=key,
            label=label,
            description=description,
            impl_kind=impl_kind,
            impl=impl,
            sample_preview=str(data.get("sample_preview") or sample),
            source="llm",
        )

    def _heuristic_draft(self, prompt: str) -> CollectionVarGeneratorDraftRead:
        """Fallback when LLM unavailable: parse simple Korean date offset phrases."""
        p = prompt.lower()
        months = re.search(r"(\d+)\s*개월", prompt)
        days = re.search(r"(\d+)\s*일", prompt)
        years = re.search(r"(\d+)\s*년", prompt)
        n = 0
        unit = "days"
        if months:
            n = int(months.group(1))
            unit = "months"
        elif years:
            n = int(years.group(1))
            unit = "years"
        elif days:
            n = int(days.group(1))
            unit = "days"
        elif "오늘" in prompt or "today" in p:
            impl = validate_custom_impl("today_yyyymmdd", {})
            sample = resolve_catalog_spec(
                CatalogGeneratorSpec(key="today", impl_kind="today_yyyymmdd", impl=impl),
            )
            return CollectionVarGeneratorDraftRead(
                key="today_yyyymmdd_alias",
                label="오늘 날짜",
                description=prompt[:120],
                impl_kind="today_yyyymmdd",
                impl=impl,
                sample_preview=sample,
                source="heuristic",
            )
        else:
            n = 3
            unit = "months"

        if "전" in prompt or "이전" in prompt or "minus" in p:
            n = -abs(n)
        else:
            n = abs(n) if n else 3

        impl = validate_custom_impl("date_offset", {"unit": unit, "n": n, "format": "YYYYMMDD"})
        key = f"date_{'minus' if n < 0 else 'plus'}_{abs(n)}_{unit}"
        label = f"{abs(n)}{({'days': '일', 'months': '개월', 'years': '년'}[unit])}{'전' if n < 0 else '후'} 날짜"
        sample = resolve_catalog_spec(
            CatalogGeneratorSpec(key=key, impl_kind="date_offset", impl=impl),
        )
        return CollectionVarGeneratorDraftRead(
            key=key,
            label=label,
            description=prompt[:200],
            impl_kind="date_offset",
            impl=impl,
            sample_preview=sample,
            source="heuristic",
        )

    async def create(
        self,
        body: CollectionVarGeneratorCreateRequest,
    ) -> CollectionVarGeneratorRead:
        key = body.key.strip().lower()
        if not is_valid_generator_key(key):
            raise InvalidInputError("key는 영문 소문자/숫자/_ 만 가능합니다.")
        if key in {k for k, _, _ in BUILTIN_META}:
            raise InvalidInputError(f"내장 생성기 key와 충돌합니다: {key}")
        existing = await self._repo.get_by_key(key)
        if existing is not None and existing.status == "active":
            raise InvalidInputError(f"이미 존재하는 생성기입니다: {key}")
        try:
            impl = validate_custom_impl(body.impl_kind, body.impl)
        except ValueError as exc:
            raise InvalidInputError(str(exc)) from exc

        if existing is not None:
            existing.label = body.label.strip()
            existing.description = (body.description or "").strip()
            existing.prompt = (body.prompt or "").strip()
            existing.impl_kind = body.impl_kind.strip().lower()
            existing.impl_json = json.dumps(impl, ensure_ascii=False)
            existing.status = "active"
            existing.created_by = (body.created_by or "").strip() or existing.created_by
            await self._repo.save(existing)
            logger.info(
                "collection_var_generator revived key=%s kind=%s",
                key,
                existing.impl_kind,
            )
            return CollectionVarGeneratorRead(
                key=existing.key,
                label=existing.label,
                description=existing.description,
                hint=existing.description or existing.prompt[:80],
                source="shared",
                impl_kind=existing.impl_kind,
                impl=impl,
                prompt=existing.prompt,
                created_by=existing.created_by or None,
                created_at=existing.created_at,
            )

        row = CollectionVarGenerator(
            key=key,
            label=body.label.strip(),
            description=(body.description or "").strip(),
            prompt=(body.prompt or "").strip(),
            impl_kind=body.impl_kind.strip().lower(),
            impl_json=json.dumps(impl, ensure_ascii=False),
            status="active",
            created_by=(body.created_by or "").strip(),
        )
        await self._repo.create(row)
        logger.info("collection_var_generator created key=%s kind=%s", key, row.impl_kind)
        return CollectionVarGeneratorRead(
            key=row.key,
            label=row.label,
            description=row.description,
            hint=row.description or row.prompt[:80],
            source="shared",
            impl_kind=row.impl_kind,
            impl=impl,
            prompt=row.prompt,
            created_by=row.created_by or None,
            created_at=row.created_at,
        )

    async def delete(self, key: str) -> None:
        k = (key or "").strip().lower()
        if not k:
            raise InvalidInputError("key가 필요합니다.")
        if k in {m[0] for m in BUILTIN_META}:
            raise InvalidInputError("내장 생성기는 삭제할 수 없습니다.")
        row = await self._repo.deactivate(k)
        if row is None:
            raise InvalidInputError(f"알 수 없는 생성기: {k}")
        logger.info("collection_var_generator deactivated key=%s", k)

    @staticmethod
    def resolve_value(
        *,
        value: str,
        generator: str | None,
        catalog: dict[str, CatalogGeneratorSpec] | None,
    ) -> str:
        return resolve_start_var_value(
            value=value,
            generator=generator,
            catalog=catalog,
        )

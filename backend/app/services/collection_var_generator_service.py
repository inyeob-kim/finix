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
    build_generator_description,
    is_valid_generator_key,
    normalize_generator_naming,
    parse_impl_json,
    resolve_catalog_spec,
    resolve_start_var_value,
    summarize_generator_for_ai,
    validate_custom_impl,
)
from app.integrations.llm_client import LlmClient
from app.models.fnx_collection_var_generator import CollectionVarGenerator
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
    CollectionVarGeneratorRecommendationRead,
    CollectionVarGeneratorUpdateRequest,
)

logger = logging.getLogger(__name__)

_ENGLISH_NAME_SAMPLES = (
    "James", "Mary", "John", "Patricia", "Robert", "Jennifer",
    "Michael", "Linda", "William", "Elizabeth", "David", "Barbara",
    "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah",
    "Charles", "Karen",
)

_PAKISTANI_NAME_SAMPLES = (
    "Ahmed", "Fatima", "Hassan", "Ayesha", "Omar", "Zainab",
    "Ali", "Maryam", "Bilal", "Sana", "Usman", "Hira",
    "Imran", "Noor", "Hamza", "Amina", "Saad", "Saba",
    "Yusuf", "Iqra",
)


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

    async def _existing_items(self) -> list[CollectionVarGeneratorRead]:
        return (await self.list_for_ui()).items

    @staticmethod
    def _catalog_cards(
        items: list[CollectionVarGeneratorRead],
    ) -> list[dict[str, Any]]:
        return [
            summarize_generator_for_ai(
                key=it.key,
                label=it.label,
                impl_kind=it.impl_kind,
                impl=it.impl,
                description=it.description or it.hint or "",
                source=it.source,
            )
            for it in items
        ]

    @staticmethod
    def _catalog_lines(items: list[CollectionVarGeneratorRead]) -> str:
        lines: list[str] = []
        for it in items:
            kind = it.impl_kind or it.key
            desc = (it.description or it.hint or "").replace("\n", " ").strip()
            desc_bit = f" desc={desc[:160]}" if desc else ""
            lines.append(
                f"- key={it.key} label={it.label} kind={kind} "
                f"source={it.source}{desc_bit}"
            )
        return "\n".join(lines)

    @staticmethod
    def _ensure_rich_description(
        *,
        description: str,
        impl_kind: str,
        impl: dict[str, Any],
        label: str,
        user_prompt: str = "",
        source: str = "user_ai",
    ) -> str:
        """Prefer AI text; always keep Returns/Purpose metadata for later matching."""
        raw = (description or "").strip()
        if raw and "Returns:" in raw:
            return raw[:512]
        purpose = raw or label or (user_prompt or "")[:120]
        built = build_generator_description(
            impl_kind=impl_kind,
            impl=impl,
            purpose=purpose,
            source=source,
        )
        if raw and "Returns:" not in raw:
            # Keep AI Korean blurb, prefix structured returns.
            returns_line = built.split(" Purpose:")[0] if " Purpose:" in built else built
            merged = f"{returns_line} Purpose: {raw}."
            if "Source:" not in merged:
                merged = f"{merged} Source: {source}."
            return merged[:512]
        return built

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

        existing = await self._existing_items()
        if self._llm is not None:
            try:
                return await self._llm_draft(text, existing)
            except Exception as exc:  # noqa: BLE001
                logger.warning("generator AI draft failed: %s", exc)

        return self._heuristic_draft(text, existing)

    def _filter_recommendations(
        self,
        raw: list[Any],
        existing: list[CollectionVarGeneratorRead],
    ) -> list[CollectionVarGeneratorRecommendationRead]:
        by_key = {it.key: it for it in existing}
        out: list[CollectionVarGeneratorRecommendationRead] = []
        seen: set[str] = set()
        for item in raw:
            if not isinstance(item, dict):
                continue
            key = str(item.get("key") or "").strip().lower()
            if not key or key in seen or key not in by_key:
                continue
            seen.add(key)
            meta = by_key[key]
            sample = ""
            try:
                if meta.source == "builtin":
                    sample = resolve_start_var_value(value="", generator=key)
                else:
                    sample = resolve_catalog_spec(
                        CatalogGeneratorSpec(
                            key=key,
                            impl_kind=meta.impl_kind or key,
                            impl=meta.impl or {},
                        ),
                    )
            except Exception:  # noqa: BLE001
                sample = ""
            out.append(
                CollectionVarGeneratorRecommendationRead(
                    key=key,
                    label=meta.label,
                    source=meta.source,
                    reason=str(item.get("reason") or "").strip(),
                    sample_preview=sample,
                ),
            )
            if len(out) >= 5:
                break
        return out

    def _parse_draft_block(
        self,
        data: dict[str, Any] | None,
        *,
        source: str,
        user_prompt: str = "",
    ) -> CollectionVarGeneratorDraftRead | None:
        if not isinstance(data, dict):
            return None
        key = str(data.get("key") or "").strip().lower()
        label = str(data.get("label") or "").strip()
        description = str(data.get("description") or "").strip()
        impl_kind = str(data.get("impl_kind") or "").strip()
        impl_raw = data.get("impl") if isinstance(data.get("impl"), dict) else {}
        if not impl_kind:
            return None
        if key and not is_valid_generator_key(key):
            raise InvalidInputError("생성기 key 형식이 올바르지 않습니다.")
        if not label:
            raise InvalidInputError("생성기 label 이 비어 있습니다.")
        if not key:
            key = f"gen_{impl_kind}"[:64]
            if not is_valid_generator_key(key):
                key = "custom_generator"
        impl = validate_custom_impl(impl_kind, impl_raw)
        sample = resolve_catalog_spec(
            CatalogGeneratorSpec(key=key, impl_kind=impl_kind, impl=impl),
        )
        key, label = normalize_generator_naming(
            key=key,
            label=label,
            impl_kind=impl_kind,
            impl=impl,
        )
        description = self._ensure_rich_description(
            description=description,
            impl_kind=impl_kind,
            impl=impl,
            label=label,
            user_prompt=user_prompt,
            source="user_ai" if source == "llm" else "heuristic",
        )
        return CollectionVarGeneratorDraftRead(
            key=key,
            label=label,
            description=description,
            impl_kind=impl_kind,
            impl=impl,
            sample_preview=str(data.get("sample_preview") or sample),
            source=source,  # type: ignore[arg-type]
            has_draft=True,
        )

    async def _llm_draft(
        self,
        prompt: str,
        existing: list[CollectionVarGeneratorRead],
    ) -> CollectionVarGeneratorDraftRead:
        assert self._llm is not None
        raw = await self._llm.complete_json(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=build_user_prompt(prompt, self._catalog_cards(existing)),
        )
        data = json.loads(_strip_json_fences(raw))
        if not isinstance(data, dict):
            raise InvalidInputError("LLM JSON 형식이 올바르지 않습니다.")

        recommendations = self._filter_recommendations(
            data.get("recommendations") if isinstance(data.get("recommendations"), list) else [],
            existing,
        )

        draft_block = data.get("draft")
        # Backward-compatible: flat draft fields without nested "draft"
        if draft_block is None and data.get("impl_kind"):
            draft_block = data

        parsed: CollectionVarGeneratorDraftRead | None = None
        try:
            parsed = self._parse_draft_block(
                draft_block if isinstance(draft_block, dict) else None,
                source="llm",
                user_prompt=prompt,
            )
        except InvalidInputError:
            if not recommendations:
                raise
            parsed = None
        except ValueError as exc:
            if not recommendations:
                raise InvalidInputError(str(exc)) from exc
            parsed = None

        if parsed is None and not recommendations:
            raise InvalidInputError("추천 생성기나 신규 초안을 만들지 못했습니다.")

        if parsed is None:
            result = CollectionVarGeneratorDraftRead(
                source="llm",
                recommendations=recommendations,
                has_draft=False,
            )
        else:
            result = parsed.model_copy(
                update={
                    "recommendations": recommendations,
                    "has_draft": True,
                },
            )

        logger.info(
            "collection_var_generator draft ok version=%s recs=%s has_draft=%s",
            PROMPT_VERSION,
            len(recommendations),
            result.has_draft,
        )
        return result

    def _recommendation_for_key(
        self,
        key: str,
        existing: list[CollectionVarGeneratorRead],
        reason: str,
    ) -> CollectionVarGeneratorRecommendationRead | None:
        meta = next((it for it in existing if it.key == key), None)
        if meta is None:
            return None
        sample = ""
        try:
            if meta.source == "builtin":
                sample = resolve_start_var_value(value="", generator=key)
            else:
                sample = resolve_catalog_spec(
                    CatalogGeneratorSpec(
                        key=key,
                        impl_kind=meta.impl_kind or key,
                        impl=meta.impl or {},
                    ),
                )
        except Exception:  # noqa: BLE001
            sample = ""
        return CollectionVarGeneratorRecommendationRead(
            key=key,
            label=meta.label,
            source=meta.source,
            reason=reason,
            sample_preview=sample,
        )

    def _heuristic_draft(
        self,
        prompt: str,
        existing: list[CollectionVarGeneratorRead],
    ) -> CollectionVarGeneratorDraftRead:
        """Fallback when LLM unavailable."""
        p = prompt.lower()

        # Match existing builtins first.
        if any(x in prompt for x in ("한글", "한국")) and any(
            x in prompt for x in ("이름", "성명", "name")
        ):
            rec = self._recommendation_for_key(
                "korean_name", existing, "한글 이름 요청과 일치",
            )
            if rec:
                return CollectionVarGeneratorDraftRead(
                    source="heuristic",
                    recommendations=[rec],
                    has_draft=False,
                )

        if "uuid" in p:
            rec = self._recommendation_for_key("uuid", existing, "UUID 요청과 일치")
            if rec:
                return CollectionVarGeneratorDraftRead(
                    source="heuristic",
                    recommendations=[rec],
                    has_draft=False,
                )

        if any(x in prompt for x in ("주민", "rrn")):
            rec = self._recommendation_for_key(
                "korean_rrn", existing, "주민번호 요청과 일치",
            )
            if rec:
                return CollectionVarGeneratorDraftRead(
                    source="heuristic",
                    recommendations=[rec],
                    has_draft=False,
                )

        if any(x in p for x in ("난수", "숫자 랜덤", "random digit", "random number")):
            rec = self._recommendation_for_key(
                "random_digits", existing, "난수 숫자 요청과 일치",
            )
            if rec:
                return CollectionVarGeneratorDraftRead(
                    source="heuristic",
                    recommendations=[rec],
                    has_draft=False,
                )

        # Name-like requests that are not Korean → pick_from_list
        name_like = any(x in prompt for x in ("이름", "성명", "name", "네임"))
        if name_like:
            if any(x in p for x in ("pakistan", "파키스탄", "pakistani", "우르두")):
                values = list(_PAKISTANI_NAME_SAMPLES)
                key = "pakistani_name"
                label = "파키스탄 이름"
            elif any(x in p for x in ("english", "영문", "영어", "서양")):
                values = list(_ENGLISH_NAME_SAMPLES)
                key = "english_name"
                label = "영문 이름"
            else:
                values = list(_ENGLISH_NAME_SAMPLES)
                key = "random_name"
                label = "랜덤 이름"
            impl = validate_custom_impl("pick_from_list", {"values": values})
            sample = resolve_catalog_spec(
                CatalogGeneratorSpec(key=key, impl_kind="pick_from_list", impl=impl),
            )
            return CollectionVarGeneratorDraftRead(
                key=key,
                label=label,
                description=self._ensure_rich_description(
                    description=prompt[:200],
                    impl_kind="pick_from_list",
                    impl=impl,
                    label=label,
                    user_prompt=prompt,
                    source="heuristic",
                ),
                impl_kind="pick_from_list",
                impl=impl,
                sample_preview=sample,
                source="heuristic",
                has_draft=True,
            )

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
            rec = self._recommendation_for_key(
                "today_yyyymmdd", existing, "오늘 날짜 요청과 일치",
            )
            if rec:
                return CollectionVarGeneratorDraftRead(
                    source="heuristic",
                    recommendations=[rec],
                    has_draft=False,
                )
            impl = validate_custom_impl("today_yyyymmdd", {})
            sample = resolve_catalog_spec(
                CatalogGeneratorSpec(key="today", impl_kind="today_yyyymmdd", impl=impl),
            )
            return CollectionVarGeneratorDraftRead(
                key="today_yyyymmdd_alias",
                label="오늘 날짜",
                description=self._ensure_rich_description(
                    description=prompt[:120],
                    impl_kind="today_yyyymmdd",
                    impl=impl,
                    label="오늘 날짜",
                    user_prompt=prompt,
                    source="heuristic",
                ),
                impl_kind="today_yyyymmdd",
                impl=impl,
                sample_preview=sample,
                source="heuristic",
                has_draft=True,
            )
        else:
            n = 3
            unit = "months"

        if "전" in prompt or "이전" in prompt or "minus" in p:
            n = -abs(n)
        else:
            n = abs(n) if n else 3

        impl = validate_custom_impl(
            "date_offset",
            {"unit": unit, "n": n, "format": "YYYYMMDD"},
        )
        key = f"date_{'minus' if n < 0 else 'plus'}_{abs(n)}_{unit}"
        label = (
            f"{abs(n)}"
            f"{({'days': '일', 'months': '개월', 'years': '년'}[unit])}"
            f"{'전' if n < 0 else '후'} 날짜"
        )
        sample = resolve_catalog_spec(
            CatalogGeneratorSpec(key=key, impl_kind="date_offset", impl=impl),
        )
        return CollectionVarGeneratorDraftRead(
            key=key,
            label=label,
            description=self._ensure_rich_description(
                description=prompt[:200],
                impl_kind="date_offset",
                impl=impl,
                label=label,
                user_prompt=prompt,
                source="heuristic",
            ),
            impl_kind="date_offset",
            impl=impl,
            sample_preview=sample,
            source="heuristic",
            has_draft=True,
        )

    async def create(
        self,
        body: CollectionVarGeneratorCreateRequest,
    ) -> CollectionVarGeneratorRead:
        try:
            impl = validate_custom_impl(body.impl_kind, body.impl)
        except ValueError as exc:
            raise InvalidInputError(str(exc)) from exc

        key, label = normalize_generator_naming(
            key=(body.key or "").strip().lower(),
            label=(body.label or "").strip(),
            impl_kind=body.impl_kind.strip().lower(),
            impl=impl,
        )
        if not is_valid_generator_key(key):
            raise InvalidInputError("key는 영문 소문자/숫자/_ 만 가능합니다.")
        if key in {k for k, _, _ in BUILTIN_META}:
            raise InvalidInputError(f"내장 생성기 key와 충돌합니다: {key}")
        existing = await self._repo.get_by_key(key)
        if existing is not None and existing.status == "active":
            raise InvalidInputError(f"이미 존재하는 생성기입니다: {key}")

        description = self._ensure_rich_description(
            description=(body.description or "").strip(),
            impl_kind=body.impl_kind.strip().lower(),
            impl=impl,
            label=label,
            user_prompt=(body.prompt or "").strip(),
            source="user_ai",
        )

        if existing is not None:
            existing.label = label
            existing.description = description
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
            label=label,
            description=description,
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

    async def update(
        self,
        key: str,
        body: CollectionVarGeneratorUpdateRequest,
    ) -> CollectionVarGeneratorRead:
        k = (key or "").strip().lower()
        if not k:
            raise InvalidInputError("key가 필요합니다.")
        if k in {m[0] for m in BUILTIN_META}:
            raise InvalidInputError("내장 생성기는 수정할 수 없습니다.")
        row = await self._repo.get_by_key(k)
        if row is None or row.status != "active":
            raise InvalidInputError(f"알 수 없는 생성기: {k}")

        next_kind = (body.impl_kind or row.impl_kind).strip().lower()
        next_impl_raw = body.impl if body.impl is not None else parse_impl_json(row.impl_json)
        try:
            next_impl = validate_custom_impl(next_kind, next_impl_raw)
        except ValueError as exc:
            raise InvalidInputError(str(exc)) from exc

        if body.label is not None:
            row.label = body.label.strip()
        if body.prompt is not None:
            row.prompt = body.prompt.strip()
        row.impl_kind = next_kind
        row.impl_json = json.dumps(next_impl, ensure_ascii=False)
        _, normalized_label = normalize_generator_naming(
            key=row.key,
            label=row.label,
            impl_kind=next_kind,
            impl=next_impl,
        )
        row.label = normalized_label
        if body.description is not None:
            row.description = self._ensure_rich_description(
                description=body.description.strip(),
                impl_kind=next_kind,
                impl=next_impl,
                label=row.label,
                user_prompt=row.prompt or "",
                source="user_ai",
            )
        elif "Returns:" not in (row.description or ""):
            row.description = self._ensure_rich_description(
                description=row.description or "",
                impl_kind=next_kind,
                impl=next_impl,
                label=row.label,
                user_prompt=row.prompt or "",
                source="user_ai",
            )
        await self._repo.save(row)
        logger.info("collection_var_generator updated key=%s kind=%s", k, next_kind)
        return CollectionVarGeneratorRead(
            key=row.key,
            label=row.label,
            description=row.description,
            hint=row.description or row.prompt[:80],
            source="shared",
            impl_kind=row.impl_kind,
            impl=next_impl,
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

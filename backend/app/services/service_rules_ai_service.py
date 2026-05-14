"""AI-assisted generation for service rule YAML (draft bundles)."""

from __future__ import annotations

import json
import re
from typing import Any

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.integrations.llm_client import LlmClient
from app.prompts.service_rules_from_source_prompt import (
    build_system_prompt_from_source,
    build_user_prompt_from_source,
)
from app.prompts.service_rules_yaml_prompt import (
    ServiceMetaForRules,
    build_system_prompt,
    build_user_prompt,
)
from app.repositories.service_catalog_repo import ServiceCatalogRepository
from app.services.service_rules_service import ServiceRulesService


_FENCE_RE = re.compile(r"^```[a-zA-Z0-9_-]*\n|\n```$", re.MULTILINE)


def _strip_fences(text: str) -> str:
    t = (text or "").strip()
    # Remove common markdown fences if the model returns them.
    t = t.replace("\r\n", "\n")
    t = _FENCE_RE.sub("", t).strip()
    return t


def _extract_dto_names(raw_json: str | None) -> tuple[str | None, str | None]:
    if not raw_json:
        return None, None
    try:
        payload = json.loads(raw_json)
    except Exception:  # noqa: BLE001
        return None, None
    if not isinstance(payload, dict):
        return None, None
    in_dto = payload.get("in_dto") or payload.get("IN_DTO_NM")
    out_dto = payload.get("out_dto") or payload.get("OUT_DTO_NM")
    in_name = str(in_dto).strip() if in_dto else None
    out_name = str(out_dto).strip() if out_dto else None
    return in_name or None, out_name or None


class ServiceRulesAiService:
    """Generate YAML via LLM then persist as draft bundle."""

    def __init__(
        self,
        *,
        llm: LlmClient,
        catalog_repo: ServiceCatalogRepository,
        rules_service: ServiceRulesService,
    ) -> None:
        self._llm = llm
        self._catalog_repo = catalog_repo
        self._rules = rules_service

    async def generate_draft(
        self,
        *,
        service_code: str,
        objective: str | None,
        include_existing: bool,
        created_by: str | None,
    ):
        code = (service_code or "").strip()
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")

        svc = await self._catalog_repo.get_by_service_code(code)
        if svc is None:
            raise EntityNotFoundError("ServiceCatalogItem", code)

        in_dto, out_dto = _extract_dto_names(svc.raw_json)
        meta = ServiceMetaForRules(
            service_code=svc.service_code,
            service_name=svc.service_name,
            http_method=svc.http_method,
            uri=svc.uri,
            in_dto=in_dto,
            out_dto=out_dto,
        )

        existing_yaml = None
        if include_existing:
            active = await self._rules.get_active(code)
            if active is not None:
                existing_yaml = active.yaml_text

        system_prompt = build_system_prompt()
        user_prompt = build_user_prompt(
            service=meta,
            objective=objective,
            existing_active_yaml=existing_yaml,
        )

        raw = await self._llm.complete_text(system_prompt=system_prompt, user_prompt=user_prompt)
        yaml_text = _strip_fences(raw)

        # Persist as draft (validates schema + coverage policy).
        return await self._rules.create_draft(
            service_code=code,
            yaml_text=yaml_text,
            source_version="ai-draft",
            created_by=created_by,
        )

    async def generate_draft_from_source(
        self,
        *,
        service_code: str,
        source_code: str,
        source_version: str | None,
        hints: str | None,
        created_by: str | None,
    ):
        """LLM reads pasted source, emits template-shaped YAML, then validates and stores draft."""
        code = (service_code or "").strip()
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")

        raw_src = (source_code or "").strip()
        if len(raw_src) < 16:
            raise InvalidInputError("소스 코드가 너무 짧습니다.")
        if len(raw_src) > 120_000:
            raw_src = raw_src[:120_000]

        svc = await self._catalog_repo.get_by_service_code(code)
        if svc is None:
            raise EntityNotFoundError("ServiceCatalogItem", code)

        in_dto, out_dto = _extract_dto_names(svc.raw_json)
        meta = ServiceMetaForRules(
            service_code=svc.service_code,
            service_name=svc.service_name,
            http_method=svc.http_method,
            uri=svc.uri,
            in_dto=in_dto,
            out_dto=out_dto,
        )

        system_prompt = build_system_prompt_from_source()
        user_prompt = build_user_prompt_from_source(
            service=meta,
            source_code=raw_src,
            hints=hints,
        )

        raw = await self._llm.complete_text(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
        yaml_text = _strip_fences(raw)

        label = (source_version or "").strip() or "source-scan"
        return await self._rules.create_draft(
            service_code=code,
            yaml_text=yaml_text,
            source_version=label,
            created_by=created_by,
        )


"""AI/heuristic suggestions for scenario extract/inject bindings."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Literal

from app.core.exceptions import InvalidInputError
from app.domain.field_chaining import infer_adjacent_step_links
from app.domain.scenario_bindings import ExtractSpec, InjectSpec, normalize_json_path_prefix
from app.integrations.llm_client import LlmClient
from app.prompts.scenario_bindings_suggest_prompt import (
    PROMPT_VERSION,
    SYSTEM_PROMPT,
    build_user_prompt,
)
from app.repositories.cbs_service_catalog_repo import CbsServiceCatalogRepository
from app.schemas.scenario_bindings_suggest_schema import (
    ScenarioBindingsSuggestRead,
    StepBindingsBlockRead,
    SuggestedBindingLinkRead,
)
from app.services.service_catalog_service import ServiceCatalogService
from app.utils.json_dot_paths import (
    collect_dot_paths,
    normalize_field_key,
    path_leaf,
)
from app.utils.rule_input_omm_skeleton import skeleton_from_catalog_row

logger = logging.getLogger(__name__)

_MAX_LINKS = 40


def _strip_json_fences(text: str) -> str:
    t = (text or "").strip().replace("\r\n", "\n")
    t = re.sub(r"^```[a-zA-Z0-9_-]*\n", "", t)
    t = re.sub(r"\n```$", "", t)
    return t.strip()


def _path_allowed(path: str, allowed: set[str]) -> bool:
    norm = normalize_json_path_prefix(path)
    leaf = path_leaf(norm)
    if norm in allowed or leaf in allowed:
        return True
    bare = norm[2:] if norm.startswith("$.") else norm
    return bare in allowed


def _to_api_path(dot_path: str) -> str:
    return normalize_json_path_prefix(dot_path)


class ScenarioBindingsAiService:
    """Suggest extract/inject rows from catalog I/O fields."""

    def __init__(
        self,
        *,
        catalog_service: ServiceCatalogService,
        cbs_repo: CbsServiceCatalogRepository,
        llm: LlmClient | None,
    ) -> None:
        self._catalog = catalog_service
        self._cbs = cbs_repo
        self._llm = llm

    async def suggest(
        self,
        *,
        service_codes: list[str],
    ) -> ScenarioBindingsSuggestRead:
        codes = [c.strip() for c in service_codes if c and c.strip()]
        if not codes:
            raise InvalidInputError("service_codes가 비어 있습니다.")
        if len(codes) < 2:
            return ScenarioBindingsSuggestRead(
                source="heuristic",
                summary="서비스가 1개뿐이라 단계 간 연결이 필요하지 않습니다.",
                links=[],
                bindings_by_service={
                    codes[0]: StepBindingsBlockRead(service_code=codes[0]),
                },
                link_count=0,
            )

        contexts = await self._load_contexts(codes)
        heuristic_links = self._heuristic_links(contexts)

        llm_links: list[dict[str, Any]] = []
        summary = ""
        source: Literal["llm", "heuristic", "hybrid"] = "heuristic"

        if self._llm is not None:
            try:
                llm_links, summary = await self._llm_links(contexts)
                source = "llm" if llm_links else "heuristic"
            except Exception as exc:  # noqa: BLE001
                logger.warning("scenario bindings LLM failed: %s", exc)
                summary = (
                    "LLM 제안을 가져오지 못해 필드명 일치 규칙으로 연결했습니다. "
                    f"({type(exc).__name__})"
                )
                source = "heuristic"
        else:
            summary = (
                "LLM이 설정되지 않아 카탈로그 필드명 일치로 연결했습니다. "
                "backend/.env 에 LLM_API_KEY를 설정하면 의미 기반 제안을 받을 수 있습니다."
            )

        if llm_links:
            validated = self._validate_links(llm_links, contexts)
            if validated:
                links = validated
                if heuristic_links and len(validated) < len(heuristic_links):
                    extra = [
                        lk
                        for lk in heuristic_links
                        if not self._link_key(lk) in {self._link_key(v) for v in validated}
                    ]
                    if extra:
                        links = validated + extra[: _MAX_LINKS - len(validated)]
                        source = "hybrid"
                if not summary:
                    summary = (
                        f"{len(links)}개 연결을 제안했습니다. "
                        "왼쪽 규칙 목록에서 검토 후 수정하세요."
                    )
            else:
                links = heuristic_links
                source = "heuristic"
                if not summary:
                    summary = "LLM 제안이 검증을 통과하지 못해 필드명 일치 연결만 적용했습니다."
        else:
            links = heuristic_links
            if not summary:
                summary = (
                    f"{len(links)}개 필드명 일치 연결을 제안했습니다."
                    if links
                    else "자동으로 연결할 만한 동일 필드명을 찾지 못했습니다. 수동으로 연결하세요."
                )

        bindings = self._links_to_bindings(links, codes)
        return ScenarioBindingsSuggestRead(
            source=source,
            summary=summary,
            links=[SuggestedBindingLinkRead.model_validate(x) for x in links],
            bindings_by_service=bindings,
            link_count=len(links),
        )

    async def _load_contexts(self, codes: list[str]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for idx, code in enumerate(codes):
            sk = await self._catalog.get_dto_skeletons(code)
            row = await self._cbs.get_raw_row_by_service_code(code)
            in_sk = sk.get("input_skeleton") or {}
            out_sk = sk.get("output_skeleton") or {}
            if row and not in_sk:
                in_sk = skeleton_from_catalog_row(row, kind="input")
            if row and not out_sk:
                out_sk = skeleton_from_catalog_row(row, kind="output")
            in_paths = collect_dot_paths(in_sk)
            out_paths = collect_dot_paths(out_sk)
            out.append(
                {
                    "index": idx,
                    "service_code": code,
                    "service_name": (row or {}).get("service_name")
                    or (row or {}).get("SRVC_NM")
                    or code,
                    "input_paths": in_paths,
                    "output_paths": out_paths,
                    "input_paths_set": set(in_paths) | {path_leaf(p) for p in in_paths},
                    "output_paths_set": set(out_paths) | {path_leaf(p) for p in out_paths},
                }
            )
        return out

    def _heuristic_links(self, contexts: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return infer_adjacent_step_links(contexts)[:_MAX_LINKS]

    async def _llm_links(
        self,
        contexts: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], str]:
        payload = [
            {
                "index": c["index"],
                "service_code": c["service_code"],
                "service_name": c["service_name"],
                "input_paths": c["input_paths"][:60],
                "output_paths": c["output_paths"][:60],
            }
            for c in contexts
        ]
        user_prompt = build_user_prompt(payload)
        assert self._llm is not None
        raw = await self._llm.complete_json(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
        )
        text = _strip_json_fences(raw)
        data = json.loads(text)
        if not isinstance(data, dict):
            raise InvalidInputError("LLM JSON 형식이 올바르지 않습니다.")
        summary = str(data.get("summary") or "").strip()
        links_raw = data.get("links")
        if not isinstance(links_raw, list):
            return [], summary
        logger.info(
            "scenario_bindings_suggest ok version=%s links=%s",
            PROMPT_VERSION,
            len(links_raw),
        )
        return [x for x in links_raw if isinstance(x, dict)], summary

    def _validate_links(
        self,
        raw_links: list[dict[str, Any]],
        contexts: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        by_idx = {c["index"]: c for c in contexts}
        out: list[dict[str, Any]] = []
        for item in raw_links[:_MAX_LINKS]:
            try:
                fi = int(item.get("from_service_index"))
                ti = int(item.get("to_service_index"))
            except (TypeError, ValueError):
                continue
            if fi not in by_idx or ti not in by_idx:
                continue
            prev = by_idx[fi]
            cur = by_idx[ti]
            resp = str(item.get("response_path") or "").strip()
            req = str(item.get("request_path") or "").strip()
            var = str(item.get("var") or path_leaf(resp)).strip()[:64]
            if not resp or not req or not var:
                continue
            if not _path_allowed(resp, prev["output_paths_set"]):
                continue
            if not _path_allowed(req, cur["input_paths_set"]):
                continue
            conf = str(item.get("confidence") or "medium").lower()
            if conf not in ("high", "medium", "low"):
                conf = "medium"
            out.append(
                {
                    "from_service_index": fi,
                    "to_service_index": ti,
                    "from_service_code": prev["service_code"],
                    "to_service_code": cur["service_code"],
                    "response_path": _to_api_path(resp),
                    "request_path": _to_api_path(req),
                    "var": var,
                    "confidence": conf,
                    "reason": (str(item.get("reason") or "").strip() or None),
                }
            )
        return out

    @staticmethod
    def _link_key(link: dict[str, Any]) -> tuple[str, str, str, str]:
        return (
            link.get("from_service_code", ""),
            link.get("to_service_code", ""),
            link.get("response_path", ""),
            link.get("request_path", ""),
        )

    def _links_to_bindings(
        self,
        links: list[dict[str, Any]],
        codes: list[str],
    ) -> dict[str, StepBindingsBlockRead]:
        extracts: dict[str, list[ExtractSpec]] = {c: [] for c in codes}
        injects: dict[str, list[InjectSpec]] = {c: [] for c in codes}
        seen_ext: set[tuple[str, str, str]] = set()
        seen_inj: set[tuple[str, str, str]] = set()

        for link in links:
            fc = link["from_service_code"]
            tc = link["to_service_code"]
            var = link["var"]
            ext_key = (fc, var, link["response_path"])
            inj_key = (tc, var, link["request_path"])
            if ext_key not in seen_ext:
                extracts[fc].append(
                    ExtractSpec(var=var, json_path=link["response_path"]),
                )
                seen_ext.add(ext_key)
            if inj_key not in seen_inj:
                injects[tc].append(
                    InjectSpec(var=var, json_path=link["request_path"]),
                )
                seen_inj.add(inj_key)

        return {
            code: StepBindingsBlockRead(
                service_code=code,
                extracts=extracts.get(code, []),
                injects=injects.get(code, []),
            )
            for code in codes
        }

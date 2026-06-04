"""Auto-infer scenario extract/inject bindings from catalog I/O (generic, all services)."""

from __future__ import annotations

from typing import Any

from app.domain.field_chaining import (
    count_binding_rows_in_steps,
    infer_adjacent_step_links,
    merge_bindings_into_steps_json,
)
from app.repositories.cbs_service_catalog_repo import CbsServiceCatalogRepository
from app.services.service_catalog_service import ServiceCatalogService
from app.utils.json_dot_paths import collect_dot_paths, path_leaf
from app.utils.rule_input_omm_skeleton import skeleton_from_catalog_row


class ScenarioAutoBindingsService:
    """Infer bindings for ordered service codes or scenario steps_json."""

    def __init__(
        self,
        *,
        catalog_service: ServiceCatalogService,
        cbs_repo: CbsServiceCatalogRepository,
    ) -> None:
        self._catalog = catalog_service
        self._cbs = cbs_repo

    async def load_contexts(self, service_codes: list[str]) -> list[dict[str, Any]]:
        codes = [c.strip() for c in service_codes if c and c.strip()]
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

    async def infer_links(self, service_codes: list[str]) -> list[dict[str, Any]]:
        contexts = await self.load_contexts(service_codes)
        return infer_adjacent_step_links(contexts)

    async def ensure_steps_json_bindings(
        self,
        steps_json: str | None,
        service_codes: list[str],
        *,
        min_existing_rows: int = 1,
    ) -> str:
        """
        Return ``steps_json`` with auto-inferred bindings merged when few/no bindings exist.
        """
        if count_binding_rows_in_steps(steps_json) >= min_existing_rows:
            return steps_json or "[]"
        links = await self.infer_links(service_codes)
        if not links:
            return steps_json or "[]"
        return merge_bindings_into_steps_json(steps_json, links)

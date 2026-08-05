"""Read-only repository for CBS service catalog JSON."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class CbsServiceRecord:
    """Normalized service metadata row used by scenario generation."""

    service_code: str
    service_name: str
    service_class_name: str
    operation_name: str
    http_method: str
    uri: str
    in_dto: str
    out_dto: str
    tx_yn: str
    timeout_ss: int


def _norm_method(raw: str) -> str:
    value = (raw or "").strip().upper()
    mapping = {
        "R": "GET",
        "U": "PUT",
        "C": "POST",
        "D": "DELETE",
    }
    if value in {"GET", "POST", "PUT", "DELETE", "PATCH"}:
        return value
    return mapping.get(value, "")


def _norm_timeout(raw: str) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def extract_raw_catalog_dicts(payload: object) -> list[dict]:
    """Support both list JSON and wrapped-object JSON shapes (shared with upload import)."""
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        collected: list[dict] = []
        for value in payload.values():
            if isinstance(value, list):
                collected.extend(x for x in value if isinstance(x, dict))
            elif isinstance(value, dict):
                collected.append(value)
        if collected:
            return collected
    return []


def raw_rows_to_cbs_records(raw_rows: list[dict]) -> list[CbsServiceRecord]:
    """Map CBS-style dict rows to normalized records; skips invalid rows."""
    rows: list[CbsServiceRecord] = []
    for row in raw_rows:
        method = _norm_method((row.get("HTTP_METHOD_NM") or row.get("http_method") or ""))
        uri = (
            row.get("SRVC_URI_CNTNT")
            or row.get("uri")
            or row.get("endpoint_uri")
            or ""
        ).strip()
        if not method or not uri or uri == "required_uri":
            continue
        code = (row.get("SRVC_CD") or row.get("service_code") or "").strip()
        if not code:
            continue
        rows.append(
            CbsServiceRecord(
                service_code=code,
                service_name=(row.get("SRVC_NM") or row.get("service_name") or "").strip(),
                service_class_name=(
                    row.get("SRVC_CLASS_NM")
                    or row.get("service_class_name")
                    or row.get("component_code")
                    or ""
                ).strip(),
                operation_name=(row.get("OPRTN_NM") or row.get("operation_name") or "").strip(),
                http_method=method,
                uri=uri,
                in_dto=(
                    row.get("IN_DTO_NM") or row.get("in_dto") or row.get("input_dto_name") or ""
                ).strip(),
                out_dto=(
                    row.get("OUT_DTO_NM") or row.get("out_dto") or row.get("output_dto_name") or ""
                ).strip(),
                tx_yn=(row.get("TX_YN") or row.get("tx_yn") or "").strip(),
                timeout_ss=_norm_timeout(row.get("TIMEOUT_SS") or row.get("timeout_ss") or ""),
            )
        )
    return rows


class CbsServiceCatalogRepository:
    """Repository that loads and searches `cbs_srvc.json` (+ optional DTO atr dump)."""

    def __init__(
        self,
        json_path: str,
        *,
        dto_atr_json_path: str | None = None,
    ) -> None:
        """Initialize repository with JSON file path."""
        self._json_path = Path(json_path)
        self._dto_atr_json_path = Path(dto_atr_json_path) if dto_atr_json_path else None
        self._loaded = False
        self._lock = asyncio.Lock()
        self._rows: list[CbsServiceRecord] = []
        self._raw_by_code: dict[str, dict] = {}
        self._dto_atr_index: dict[str, list[dict]] = {}
        self._dto_atr_loaded = False

    async def _ensure_loaded(self) -> None:
        """Load and normalize JSON rows once using background thread IO."""
        if self._loaded:
            return
        async with self._lock:
            if self._loaded:
                return
            self._rows = await asyncio.to_thread(self._load_rows_sync)
            self._loaded = True

    def _load_rows_sync(self) -> list[CbsServiceRecord]:
        """Read JSON file synchronously and return normalized records."""
        if not self._json_path.exists():
            return []
        return self._load_rows_from_json()

    def _load_rows_from_json(self) -> list[CbsServiceRecord]:
        """Parse service records from JSON payload."""
        with self._json_path.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        raw_rows = extract_raw_catalog_dicts(payload)
        self._raw_by_code = {}
        for row in raw_rows:
            code = (row.get("SRVC_CD") or row.get("service_code") or "").strip()
            if code:
                self._raw_by_code[code] = row
        return raw_rows_to_cbs_records(raw_rows)

    async def taxonomy_by_service_code(self) -> dict[str, tuple[str, str]]:
        """Return ``{service_code: (business_domain, component_code)}`` from catalog JSON."""
        from app.domain.cbs_service_taxonomy import build_taxonomy_map

        await self._ensure_loaded()
        mapped = build_taxonomy_map(self._raw_by_code)
        return {
            code: (tax.business_domain, tax.component_code)
            for code, tax in mapped.items()
        }

    def _ensure_dto_atr_loaded_sync(self) -> None:
        if self._dto_atr_loaded:
            return
        from app.domain.cbs_dto_atr import load_dto_atr_index

        path = self._dto_atr_json_path
        self._dto_atr_index = load_dto_atr_index(path) if path is not None else {}
        self._dto_atr_loaded = True

    async def build_dto_fields_index(self) -> dict[str, list[dict]]:
        """
        Map DTO class name → field attribute rows.

        Prefer the full ``cbs_dto_atr.json`` dump (all CLASS_NM), then fill gaps
        from service In/Out fields in ``cbs_srvc.json``.
        """
        await self._ensure_loaded()
        await asyncio.to_thread(self._ensure_dto_atr_loaded_sync)

        index: dict[str, list[dict]] = {
            k: list(v) for k, v in self._dto_atr_index.items()
        }
        for row in self._raw_by_code.values():
            for dto_key, fields_key in (
                ("input_dto_name", "input_fields"),
                ("IN_DTO_NM", "input_fields"),
                ("output_dto_name", "output_fields"),
                ("OUT_DTO_NM", "output_fields"),
            ):
                dto = (row.get(dto_key) or "").strip()
                if not dto:
                    continue
                fields = row.get(fields_key)
                if isinstance(fields, str):
                    try:
                        fields = json.loads(fields)
                    except (json.JSONDecodeError, TypeError):
                        fields = None
                if not isinstance(fields, list) or not fields:
                    continue
                cleaned = [x for x in fields if isinstance(x, dict)]
                if not cleaned:
                    continue
                existing = index.get(dto)
                if existing is None or len(cleaned) > len(existing):
                    index[dto] = cleaned
        return index

    async def search_by_prompt(self, prompt: str, *, limit: int = 5) -> list[CbsServiceRecord]:
        """
        Return top matching services with service-name-first weighting.

        Args:
            prompt: User natural language input.
            limit: Max number of matches.
        """
        await self._ensure_loaded()
        text = prompt.strip().lower()
        if not text:
            return self._rows[:limit]
        tokens = [t for t in text.replace("/", " ").replace("_", " ").split() if len(t) >= 2]
        if not tokens:
            return self._rows[:limit]
        scored: list[tuple[int, CbsServiceRecord]] = []
        for row in self._rows:
            score = self._score_row(row=row, text=text, tokens=tokens)
            if score > 0:
                scored.append((score, row))
        scored.sort(key=lambda x: (-x[0], x[1].service_code))
        return [r for _s, r in scored[:limit]]

    async def get_by_service_code(self, service_code: str) -> CbsServiceRecord | None:
        """Return one service metadata row by exact service_code."""
        await self._ensure_loaded()
        code = (service_code or "").strip()
        if not code:
            return None
        for row in self._rows:
            if row.service_code == code:
                return row
        return None

    async def get_raw_row_by_service_code(self, service_code: str) -> dict | None:
        """
        Return the raw ``cbs_srvc.json`` row for DTO skeleton expansion.

        Includes In/Out field lists and DTO class names used by
        ``ServiceCatalogService.get_dto_skeletons``.
        """
        await self._ensure_loaded()
        code = (service_code or "").strip()
        if not code:
            return None
        return self._raw_by_code.get(code)

    @staticmethod
    def _score_row(row: CbsServiceRecord, *, text: str, tokens: list[str]) -> int:
        """Score a row with strong priority on service_name matches."""
        service_name = row.service_name.lower()
        service_class_name = row.service_class_name.lower()
        operation_name = row.operation_name.lower()
        uri = row.uri.lower()

        score = 0
        for token in tokens:
            if token in service_name:
                score += 8
            if token in operation_name:
                score += 4
            if token in service_class_name:
                score += 2
            if token in uri:
                score += 1

        # Strong boost when full prompt is a direct phrase hit.
        if text in service_name:
            score += 16
        elif text in operation_name:
            score += 8

        return score


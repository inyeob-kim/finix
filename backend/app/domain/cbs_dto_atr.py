"""Parse CBS DTO attribute dumps used to expand nested/list skeletons."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _as_field_rows(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, str) and raw.strip():
        try:
            raw = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []
    if not isinstance(raw, list):
        return []
    return [x for x in raw if isinstance(x, dict) and (
        x.get("field_name") or x.get("FIELD_NAME") or x.get("ATR_NM")
    )]


def _normalize_field_row(item: dict[str, Any]) -> dict[str, Any]:
    """Map raw CBS / SQL aliases onto the catalog field shape."""
    fname = (
        item.get("field_name")
        or item.get("FIELD_NAME")
        or item.get("ATR_NM")
        or ""
    )
    nested = (
        item.get("nested_dto_class_name")
        or item.get("NESTED_DTO_CLASS_NAME")
        or item.get("SUB_DTO_CLASS_NM")
    )
    list_flag = (
        item.get("list_flag")
        or item.get("LIST_DTO_YN")
        or item.get("list_dto_yn")
        or "N"
    )
    return {
        "field_name": str(fname).strip(),
        "nested_dto_class_name": (
            str(nested).strip() if isinstance(nested, str) and nested.strip() else None
        ),
        "list_flag": str(list_flag or "N").upper()[:1] or "N",
        "required_flag": item.get("required_flag") or item.get("MNDTRY_YN"),
        "required_status": item.get("required_status"),
        "validation_rule": item.get("validation_rule") or item.get("ATR_VLDTN_RULE_CNTNT"),
        "validation_method_code": (
            item.get("validation_method_code") or item.get("ATR_VLDTN_WAY_CD")
        ),
        "dto_status_code": item.get("dto_status_code") or item.get("DTO_STS_CD"),
    }


def _put_class(
    index: dict[str, list[dict[str, Any]]],
    class_name: str,
    fields: list[dict[str, Any]],
) -> None:
    name = (class_name or "").strip()
    if not name or not fields:
        return
    cleaned = [_normalize_field_row(f) for f in fields]
    cleaned = [f for f in cleaned if f.get("field_name")]
    if not cleaned:
        return
    existing = index.get(name)
    if existing is None or len(cleaned) > len(existing):
        index[name] = cleaned


def _ingest_row(index: dict[str, list[dict[str, Any]]], row: dict[str, Any]) -> None:
    class_name = (
        row.get("class_name")
        or row.get("CLASS_NM")
        or row.get("dto_class_name")
        or row.get("DTO_CLASS_NM")
        or ""
    )
    fields = row.get("fields") or row.get("ATTRIBUTES") or row.get("attributes")
    _put_class(index, str(class_name), _as_field_rows(fields))


def parse_dto_atr_payload(payload: object) -> dict[str, list[dict[str, Any]]]:
    """
    Accept several export shapes:

    - ``[{ "class_name": "X", "fields": [ ... ] }, ...]``
    - ``{ "X": [ fields... ], "Y": [ ... ] }``
    - MySQL JSON export wrapper ``{ "<SQL>": [ rows... ] }`` (same as cbs_srvc.json)
    - Flat attribute rows with ``CLASS_NM`` + ``ATR_NM`` (grouped in-memory)
    """
    index: dict[str, list[dict[str, Any]]] = {}

    if isinstance(payload, list):
        # Flat rows vs class wrappers
        if payload and isinstance(payload[0], dict):
            sample = payload[0]
            if sample.get("field_name") or sample.get("ATR_NM"):
                # Flat attribute rows — group by class
                buckets: dict[str, list[dict[str, Any]]] = {}
                for row in payload:
                    if not isinstance(row, dict):
                        continue
                    cls = (
                        row.get("class_name")
                        or row.get("CLASS_NM")
                        or row.get("dto_class_name")
                        or ""
                    )
                    if not str(cls).strip():
                        continue
                    buckets.setdefault(str(cls).strip(), []).append(row)
                for cls, rows in buckets.items():
                    _put_class(index, cls, rows)
                return index
        for row in payload:
            if isinstance(row, dict):
                _ingest_row(index, row)
        return index

    if isinstance(payload, dict):
        # Dict of class_name → fields list
        values_are_field_lists = all(
            isinstance(v, list) for v in payload.values()
        ) and any(payload.values())
        keys_look_like_classes = all(
            isinstance(k, str) and not k.strip().upper().startswith("SELECT")
            for k in payload
        )
        if values_are_field_lists and keys_look_like_classes:
            for cls, fields in payload.items():
                _put_class(index, str(cls), _as_field_rows(fields))
            return index

        # MySQL-style wrapper or mixed
        for key, value in payload.items():
            if isinstance(value, list):
                for row in value:
                    if isinstance(row, dict):
                        _ingest_row(index, row)
            elif isinstance(value, dict):
                _ingest_row(index, value)
            elif isinstance(key, str) and not key.upper().startswith("SELECT"):
                # class_name → fields already handled above
                pass
        return index

    return index


def load_dto_atr_index(path: str | Path | None) -> dict[str, list[dict[str, Any]]]:
    """Load DTO attribute JSON from disk; empty dict when missing/invalid."""
    if not path:
        return {}
    p = Path(path)
    if not p.is_file():
        return {}
    try:
        with p.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except (OSError, json.JSONDecodeError, TypeError):
        return {}
    return parse_dto_atr_payload(payload)

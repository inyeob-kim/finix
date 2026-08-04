"""Parse Postman Collection v2.1 or single-request JSON into flat candidates."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from app.domain.service_uri_match import extract_service_path

# Bare {{macro}} tokens (unquoted) break JSON.parse; quote them for import.
_BARE_MACRO_RE = re.compile(r'(?<!["\w])(\{\{[^{}]+\}\})(?!["\w])')


@dataclass(frozen=True)
class PostmanRequestCandidate:
    """One HTTP request extracted from a Postman document."""

    index: int
    name: str
    folder: str
    method: str
    path: str
    body: dict[str, Any]
    description: str
    test_script_excerpt: str


def _coerce_json_object(parsed: Any) -> dict[str, Any]:
    if isinstance(parsed, dict):
        return parsed
    # Root array payloads (common list DTO) → wrap for rule input.
    if isinstance(parsed, list):
        return {"items": parsed}
    return {}


def _strip_json_comments(text: str) -> str:
    """Remove // and /* */ comments outside of string literals (best-effort)."""
    out: list[str] = []
    i = 0
    n = len(text)
    in_string = False
    escape = False
    while i < n:
        ch = text[i]
        if in_string:
            out.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            i += 1
            continue
        if ch == '"':
            in_string = True
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < n:
            nxt = text[i + 1]
            if nxt == "/":
                i += 2
                while i < n and text[i] != "\n":
                    i += 1
                continue
            if nxt == "*":
                i += 2
                while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                    i += 1
                i = min(i + 2, n)
                continue
        out.append(ch)
        i += 1
    return "".join(out)


def _loads_body_json(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        return {}
    # Postman raw often includes JS comments (e.g. `// balance update`) which break JSON.
    for base in (text, _strip_json_comments(text)):
        try:
            return _coerce_json_object(json.loads(base))
        except Exception:  # noqa: BLE001
            pass
        fixed = _BARE_MACRO_RE.sub(r'"\1"', base)
        try:
            return _coerce_json_object(json.loads(fixed))
        except Exception:  # noqa: BLE001
            pass
    return {}


def _parse_urlencoded(body: dict[str, Any]) -> dict[str, Any]:
    rows = body.get("urlencoded")
    if not isinstance(rows, list):
        return {}
    out: dict[str, Any] = {}
    for row in rows:
        if not isinstance(row, dict) or row.get("disabled") is True:
            continue
        key = str(row.get("key") or "").strip()
        if not key:
            continue
        out[key] = row.get("value")
    return out


def _parse_formdata(body: dict[str, Any]) -> dict[str, Any]:
    rows = body.get("formdata")
    if not isinstance(rows, list):
        return {}
    out: dict[str, Any] = {}
    for row in rows:
        if not isinstance(row, dict) or row.get("disabled") is True:
            continue
        if str(row.get("type") or "text").lower() == "file":
            continue
        key = str(row.get("key") or "").strip()
        if not key:
            continue
        out[key] = row.get("value")
    return out


def _parse_body(request: dict[str, Any]) -> dict[str, Any]:
    body = request.get("body")
    if not isinstance(body, dict):
        return {}
    if body.get("disabled") is True:
        return {}

    mode = str(body.get("mode") or "raw").strip().lower() or "raw"
    raw = body.get("raw")
    if mode == "raw" or (isinstance(raw, str) and raw.strip()):
        if isinstance(raw, str) and raw.strip():
            parsed = _loads_body_json(raw)
            if parsed:
                return parsed
    if mode == "urlencoded":
        return _parse_urlencoded(body)
    if mode == "formdata":
        return _parse_formdata(body)
    for parser in (_parse_urlencoded, _parse_formdata):
        parsed = parser(body)
        if parsed:
            return parsed
    return {}


def _event_script_text(item: dict[str, Any], listen: str) -> str:
    events = item.get("event")
    if not isinstance(events, list):
        return ""
    chunks: list[str] = []
    for ev in events:
        if not isinstance(ev, dict):
            continue
        if str(ev.get("listen") or "").lower() != listen.lower():
            continue
        script = ev.get("script")
        if isinstance(script, dict):
            exec_part = script.get("exec")
            if isinstance(exec_part, list):
                chunks.append("\n".join(str(line) for line in exec_part))
            elif isinstance(exec_part, str):
                chunks.append(exec_part)
        elif isinstance(script, str):
            chunks.append(script)
    text = "\n".join(chunks).strip()
    return text[:2000] if text else ""


def _walk_items(
    items: list[Any],
    *,
    folder: str,
    out: list[tuple[str, str, dict[str, Any], dict[str, Any]]],
) -> None:
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip() or "unnamed"
        nested = item.get("item")
        if isinstance(nested, list):
            next_folder = f"{folder}/{name}" if folder else name
            _walk_items(nested, folder=next_folder, out=out)
            continue
        request = item.get("request")
        if isinstance(request, dict):
            out.append((name, folder, request, item))


def parse_collection_requests(payload: Any) -> list[PostmanRequestCandidate]:
    """
    Normalize Collection or single Request JSON into candidates.

    Accepts:
    - Collection v2.1 with ``item``
    - Single request export with top-level ``request``
    - Bare ``item`` list wrapper
    """
    if isinstance(payload, list):
        payload = {"item": payload}
    if not isinstance(payload, dict):
        return []

    collected: list[tuple[str, str, dict[str, Any], dict[str, Any]]] = []

    top_request = payload.get("request")
    if isinstance(top_request, dict) and "item" not in payload:
        name = str(payload.get("name") or "request").strip() or "request"
        collected.append((name, "", top_request, payload))
    else:
        items = payload.get("item")
        if isinstance(items, list):
            _walk_items(items, folder="", out=collected)

    candidates: list[PostmanRequestCandidate] = []
    for idx, (name, folder, request, item) in enumerate(collected):
        method = str(request.get("method") or "POST").strip().upper() or "POST"
        path = extract_service_path(request.get("url"))
        description = ""
        desc = request.get("description")
        if isinstance(desc, str):
            description = desc.strip()
        elif isinstance(desc, dict):
            description = str(desc.get("content") or "").strip()
        if not description:
            item_desc = item.get("description")
            if isinstance(item_desc, str):
                description = item_desc.strip()
        candidates.append(
            PostmanRequestCandidate(
                index=idx,
                name=name,
                folder=folder,
                method=method,
                path=path,
                body=_parse_body(request),
                description=description,
                test_script_excerpt=_event_script_text(item, "test"),
            )
        )
    return candidates

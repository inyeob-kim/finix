"""Parse pasted log text or structured JSON into ParsedExchange list."""

from __future__ import annotations

import json
import re
from typing import Any

from app.domain.bxcm_log.classifiers import classify_exchange
from app.domain.bxcm_log.models import ParsedExchange

_HTTP_LINE = re.compile(
    r"\b(?P<method>GET|POST|PUT|PATCH|DELETE)\s+(?P<path>/[^\s\"']+)",
    re.IGNORECASE,
)
_STATUS_LINE = re.compile(
    r"(?:HTTP[/\d.]*\s+|status(?:Code)?\s*[:=]\s*)(?P<status>[1-5]\d{2})\b",
    re.IGNORECASE,
)
_SRVC_CD = re.compile(r"\b(?:srvcCd|service_code|serviceCode)\s*[:=]\s*[\"']?(?P<code>[A-Za-z0-9_-]+)", re.I)
_JSON_OBJECT = re.compile(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", re.DOTALL)


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def exchange_from_mapping(raw: dict[str, Any]) -> ParsedExchange:
    method = str(raw.get("method") or raw.get("http_method") or "POST").upper()
    endpoint = str(
        raw.get("endpoint") or raw.get("uri") or raw.get("path") or raw.get("url") or "/",
    ).strip() or "/"
    if "://" in endpoint:
        # strip scheme+host if a full URL was pasted
        after = endpoint.split("://", 1)[1]
        slash = after.find("/")
        endpoint = after[slash:] if slash >= 0 else "/"
    status_raw = raw.get("http_status", raw.get("status"))
    http_status = int(status_raw) if status_raw is not None and str(status_raw).isdigit() else None
    header = raw.get("cbb_header") or raw.get("cbbHeader") or raw.get("system_header") or {}
    if not isinstance(header, dict):
        header = {}
    service_code = (
        raw.get("service_code")
        or raw.get("serviceCode")
        or header.get("srvcCd")
        or None
    )
    if service_code is not None:
        service_code = str(service_code).strip() or None
    req = raw.get("request_body", raw.get("request", raw.get("input")))
    res = raw.get("response_body", raw.get("response", raw.get("output")))
    exchange = ParsedExchange(
        method=method,
        endpoint=endpoint if endpoint.startswith("/") else f"/{endpoint}",
        http_status=http_status,
        service_code=service_code,
        cbb_header=_as_dict(header),
        request_body=req if isinstance(req, (dict, list)) else None,
        response_body=res,
        biz_error_code=(
            str(raw["biz_error_code"]).strip()
            if raw.get("biz_error_code")
            else (
                str(raw["error_code"]).strip()
                if raw.get("error_code")
                else None
            )
        ),
    )
    return classify_exchange(exchange)


def _parse_structured_json(text: str) -> list[ParsedExchange] | None:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    rows: list[Any]
    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        if isinstance(data.get("exchanges"), list):
            rows = data["exchanges"]
        elif any(k in data for k in ("method", "endpoint", "uri", "path", "request_body", "request")):
            rows = [data]
        else:
            return None
    else:
        return None
    out: list[ParsedExchange] = []
    for item in rows:
        if isinstance(item, dict):
            out.append(exchange_from_mapping(item))
    return out


def _try_load_json(fragment: str) -> Any | None:
    try:
        return json.loads(fragment)
    except json.JSONDecodeError:
        return None


def _parse_http_text_blocks(text: str) -> list[ParsedExchange]:
    """Heuristic: HTTP method/path lines + nearby JSON + status."""
    exchanges: list[ParsedExchange] = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        match = _HTTP_LINE.search(lines[i])
        if not match:
            i += 1
            continue
        method = match.group("method").upper()
        path = match.group("path")
        window = "\n".join(lines[i : i + 80])
        status_m = _STATUS_LINE.search(window)
        http_status = int(status_m.group("status")) if status_m else None
        srvc_m = _SRVC_CD.search(window)
        service_code = srvc_m.group("code") if srvc_m else None
        jsons: list[Any] = []
        for jm in _JSON_OBJECT.finditer(window):
            loaded = _try_load_json(jm.group(0))
            if loaded is not None:
                jsons.append(loaded)
        request_body = jsons[0] if jsons else None
        response_body = jsons[1] if len(jsons) > 1 else (jsons[0] if http_status and jsons else None)
        if len(jsons) == 1 and http_status and http_status >= 400:
            response_body = jsons[0]
            request_body = None
        header: dict[str, Any] = {}
        if service_code:
            header["srvcCd"] = service_code
        exchange = ParsedExchange(
            method=method,
            endpoint=path,
            http_status=http_status,
            service_code=service_code,
            cbb_header=header,
            request_body=request_body if isinstance(request_body, (dict, list)) else None,
            response_body=response_body,
            parse_warnings=[] if http_status is not None else ["http_status not found in nearby lines"],
        )
        exchanges.append(classify_exchange(exchange))
        i += 1
    return exchanges


def parse_log_text(text: str) -> list[ParsedExchange]:
    """
    Parse pasted log / JSON into classified exchanges.

    Preferred formats:
    1) JSON array / ``{ "exchanges": [ ... ] }`` of exchange objects
    2) Heuristic HTTP method/path + JSON blocks in plain text
    """
    raw = (text or "").strip()
    if not raw:
        return []
    structured = _parse_structured_json(raw)
    if structured is not None:
        return structured
    return _parse_http_text_blocks(raw)

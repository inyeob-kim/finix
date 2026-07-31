"""Deterministic happy / negative classification for parsed exchanges."""

from __future__ import annotations

from typing import Any

from app.domain.bxcm_log.models import ParsedExchange


def biz_error_code_from_body(body: Any) -> str:
    """Extract CBS-style business error code from a response body."""
    row = body
    if isinstance(body, list) and len(body) == 1 and isinstance(body[0], dict):
        row = body[0]
    if not isinstance(row, dict):
        return ""
    return str(
        row.get("messageId")
        or row.get("errorCode")
        or row.get("error_code")
        or row.get("code")
        or "",
    ).strip()


def classify_exchange(exchange: ParsedExchange) -> ParsedExchange:
    """Set path_kind and biz_error_code from status + response body."""
    code = (exchange.biz_error_code or "").strip() or biz_error_code_from_body(
        exchange.response_body,
    )
    exchange.biz_error_code = code or None
    status = exchange.http_status
    is_http_error = status is not None and status >= 400
    if is_http_error or code:
        exchange.path_kind = "negative"
    else:
        exchange.path_kind = "happy"
    return exchange

"""Parsed Bxcm / transaction-log exchange shapes (pure data)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class ParsedExchange:
    """One HTTP request/response pair extracted from logs or structured paste."""

    method: str
    endpoint: str
    http_status: int | None = None
    service_code: str | None = None
    cbb_header: dict[str, Any] = field(default_factory=dict)
    request_body: dict[str, Any] | list[Any] | None = None
    response_body: Any = None
    biz_error_code: str | None = None
    path_kind: str = "happy"  # happy | negative
    parse_warnings: list[str] = field(default_factory=list)

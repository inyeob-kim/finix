"""HTTP step response wrapper with optional timing metadata."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class StepHttpResult:
    status: int
    body: Any
    response_time_ms: int | None = None
    response_size_bytes: int | None = None
    method: str | None = None
    request_url: str | None = None


def coerce_step_http_result(raw: StepHttpResult | tuple[Any, ...]) -> StepHttpResult:
    """Normalize legacy ``(status, body)`` tuples and ``StepHttpResult``."""
    if isinstance(raw, StepHttpResult):
        return raw
    if isinstance(raw, tuple) and len(raw) >= 2:
        return StepHttpResult(status=int(raw[0]), body=raw[1])
    raise TypeError(f"Unsupported HTTP step result type: {type(raw)!r}")

"""Helpers for Server-Sent Events framing."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from app.core.exceptions import DomainError

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def sse_pack(event: dict[str, Any]) -> str:
    """Serialize one event dict into an SSE `data:` frame."""
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


async def sse_stream_events(
    events: AsyncIterator[dict[str, Any]],
    *,
    fallback_message: str,
) -> AsyncIterator[str]:
    """Yield SSE frames, converting failures into a terminal error event."""
    try:
        async for event in events:
            yield sse_pack(event)
    except DomainError as exc:
        yield sse_pack({"type": "error", "message": str(exc)})
    except Exception as exc:  # noqa: BLE001
        yield sse_pack({"type": "error", "message": str(exc) or fallback_message})

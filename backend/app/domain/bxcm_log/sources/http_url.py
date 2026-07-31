"""HTTP(S) bulk log source."""

from __future__ import annotations

import httpx


def fetch_bulk_log_url(url: str, *, timeout: float = 60.0) -> str:
    """GET *url* and return response text. Raises on HTTP errors."""
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        response = client.get(url)
        response.raise_for_status()
        return response.text or ""

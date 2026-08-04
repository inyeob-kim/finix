"""Normalize request URLs and match them to catalog service URIs."""

from __future__ import annotations

import re
from typing import Any

_SCHEME_HOST_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://[^/]*")
_LEADING_VAR_RE = re.compile(r"^\{\{[^{}]+\}\}/?")


def _url_raw_from_postman_url(url: Any) -> str:
    """Extract a raw URL string from a Postman url field (str or object)."""
    if isinstance(url, str):
        return url.strip()
    if not isinstance(url, dict):
        return ""
    raw = url.get("raw")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    host = url.get("host")
    path = url.get("path")
    host_part = ""
    if isinstance(host, list):
        host_part = ".".join(str(h) for h in host if h is not None)
    elif isinstance(host, str):
        host_part = host
    path_part = ""
    if isinstance(path, list):
        path_part = "/".join(str(p).lstrip("/") for p in path if p is not None)
    elif isinstance(path, str):
        path_part = path.lstrip("/")
    if host_part and path_part:
        return f"{host_part}/{path_part}"
    return path_part or host_part


def extract_service_path(url: Any) -> str:
    """
    Return catalog-comparable path (e.g. ``/PaymentTransfer/StandingOrder/Open``).

    Handles ``{{anyVar}}/...``, ``http://host/...``, path-only, and query strings.
    """
    text = _url_raw_from_postman_url(url)
    if not text:
        return ""
    text = text.split("?", 1)[0].split("#", 1)[0].strip()
    text = _SCHEME_HOST_RE.sub("", text)
    while True:
        nxt = _LEADING_VAR_RE.sub("", text, count=1)
        if nxt == text:
            break
        text = nxt
    text = text.strip()
    if not text or text == "/":
        return ""
    if not text.startswith("/"):
        text = f"/{text}"
    return text


def match_service_code(
    *,
    path: str,
    catalog_uris: dict[str, str],
    operation_id: str | None = None,
) -> str | None:
    """Map a request path to catalog ``service_code`` by URI suffix or operationId."""
    if operation_id:
        for code in catalog_uris:
            if code.lower() == operation_id.lower() or operation_id.upper().endswith(
                code.upper()
            ):
                return code
    norm_path = (path or "").rstrip("/") or "/"
    for code, uri in catalog_uris.items():
        catalog_path = extract_service_path(uri) or (uri or "").rstrip("/") or "/"
        u = catalog_path.rstrip("/") or "/"
        if norm_path == u or norm_path.endswith(u) or u.endswith(norm_path):
            return code
    return None

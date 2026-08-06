"""Live HTTP execution for scenario test-case steps."""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import urljoin

import httpx

from app.domain.postman_collection_config import PostmanCollectionConfig
from app.domain.postman_bxm_system_header import collection_start_vars
from app.domain.collection_var_generators import (
    CatalogGeneratorSpec,
    resolve_start_var_value,
)
from app.domain.step_http_result import StepHttpResult
from app.models.fnx_testcase import FnxTestcase

DEFAULT_TIMEOUT_SEC = 30.0


def initial_context_from_postman(
    config: PostmanCollectionConfig | None,
    *,
    catalog: dict[str, CatalogGeneratorSpec] | None = None,
) -> dict[str, Any]:
    """Seed scenario runtime context from collection variables (not header vars)."""
    ctx: dict[str, Any] = {}
    if config is None:
        return ctx
    resolve_cache: dict[str, Any] = {}
    for row in collection_start_vars(config):
        key = row.key.strip()
        if not key:
            continue
        ctx[key] = resolve_start_var_value(
            value=row.value,
            generator=row.generator,
            catalog=catalog,
            resolve_cache=resolve_cache,
        )
    return ctx


def join_base_url_and_endpoint(base_url: str, endpoint: str | None) -> str:
    """Build absolute request URL from base URL and testcase endpoint path."""
    base = base_url.strip().rstrip("/")
    path = (endpoint or "/").strip()
    if not path.startswith("/"):
        path = f"/{path}"
    if not base:
        return path
    return urljoin(f"{base}/", path.lstrip("/"))


def headers_to_map(headers: list[dict[str, str]]) -> dict[str, str]:
    out: dict[str, str] = {}
    seen: set[str] = set()
    for row in headers:
        key = row.get("key", "").strip()
        if not key:
            continue
        lower = key.lower()
        if lower in seen:
            continue
        seen.add(lower)
        out[key] = row.get("value", "")
    return out


def execute_http_testcase(
    testcase: FnxTestcase,
    *,
    base_url: str,
    request_body: dict[str, Any],
    headers: list[dict[str, str]],
    timeout: float = DEFAULT_TIMEOUT_SEC,
) -> StepHttpResult:
    """Perform one HTTP call and return status, body, and timing metadata."""
    url = join_base_url_and_endpoint(base_url, testcase.endpoint)
    method = (testcase.http_method or "POST").upper()
    header_map = headers_to_map(headers)
    started = time.perf_counter()
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        response = client.request(method, url, json=request_body, headers=header_map)
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    try:
        body = response.json()
    except ValueError:
        text = response.text
        body = {"_raw": text[:4000]} if text else {}
    from app.domain.execution_step_evaluator import normalize_cbs_response_body

    body = normalize_cbs_response_body(body)
    content = response.content or b""
    return StepHttpResult(
        status=response.status_code,
        body=body,
        response_time_ms=elapsed_ms,
        response_size_bytes=len(content),
        method=method,
        request_url=url,
    )


def make_live_response_callback(
    *,
    base_url: str,
    postman_config: PostmanCollectionConfig | None,
    step_service_codes: dict[int, str] | None = None,
) -> Any:
    """Return sync callback compatible with ``resolve_scenario_run``."""
    from app.domain.postman_bxm_system_header import (
        build_live_http_headers,
        service_code_for_testcase,
    )

    def _call(testcase: FnxTestcase, request_body: dict[str, Any]) -> StepHttpResult:
        svc = service_code_for_testcase(
            testcase,
            step_service_codes=step_service_codes,
        )
        headers = build_live_http_headers(postman_config, service_code=svc)
        return execute_http_testcase(
            testcase,
            base_url=base_url,
            request_body=request_body,
            headers=headers,
        )

    return _call

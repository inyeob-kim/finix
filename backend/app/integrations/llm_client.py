"""Async LLM client for OpenAI-compatible and Anthropic Messages APIs."""

from __future__ import annotations

from typing import Any, Literal

import httpx

from app.core.logger import get_logger

logger = get_logger(__name__)

LlmProvider = Literal["openai", "anthropic"]

_OPENAI_DEFAULT_BASE = "https://api.openai.com/v1"
_ANTHROPIC_DEFAULT_BASE = "https://api.anthropic.com"
_ANTHROPIC_VERSION = "2023-06-01"
_JSON_ONLY_SUFFIX = (
    "\n\nYou MUST respond with valid JSON only. "
    "No markdown fences, no commentary, no text outside the JSON object."
)


class LlmClient:
    """Async chat/embeddings client selected by provider."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        provider: str = "openai",
        base_url: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 16_384,
        timeout_seconds: float = 600.0,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._provider: LlmProvider = _normalize_provider(provider)
        self._temperature = temperature
        self._max_tokens = max(256, max_tokens)
        self._timeout_seconds = max(30.0, timeout_seconds)
        if self._provider == "anthropic":
            self._base_url = (base_url or _ANTHROPIC_DEFAULT_BASE).rstrip("/")
        else:
            self._base_url = (base_url or _OPENAI_DEFAULT_BASE).rstrip("/")

    async def complete_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> str:
        """Request JSON-formatted completion text."""
        if self._provider == "anthropic":
            return await self._complete_anthropic(
                system_prompt=f"{system_prompt.rstrip()}{_JSON_ONLY_SUFFIX}",
                user_prompt=user_prompt,
                temperature=self._temperature,
                timeout=min(self._timeout_seconds, 120.0),
            )
        return await self._complete_openai(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=self._temperature,
            response_format={"type": "json_object"},
            timeout=min(self._timeout_seconds, 120.0),
        )

    async def complete_text(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float | None = None,
        timeout: float | None = None,
        cache_system_prompt: bool = False,
    ) -> str:
        """Request free-form completion text."""
        temp = self._temperature if temperature is None else temperature
        effective_timeout = self._timeout_seconds if timeout is None else timeout
        if self._provider == "anthropic":
            return await self._complete_anthropic(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temp,
                timeout=effective_timeout,
                cache_system_prompt=cache_system_prompt,
            )
        return await self._complete_openai(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temp,
            response_format=None,
            timeout=effective_timeout,
            cache_system_prompt=cache_system_prompt,
        )

    async def embed_texts(
        self,
        texts: list[str],
        *,
        model: str | None = None,
    ) -> list[list[float]]:
        """Return embedding vectors (OpenAI-compatible /embeddings only)."""
        if not texts:
            return []
        if self._provider == "anthropic":
            raise RuntimeError(
                "Anthropic does not provide embeddings. Set LLM_PROVIDER=openai for "
                "manual RAG indexing, or add a separate OpenAI embedding key via "
                "LLM_EMBEDDING_API_KEY and LLM_EMBEDDING_BASE_URL."
            )
        url = f"{self._base_url}/embeddings"
        payload: dict[str, Any] = {
            "model": model or "text-embedding-3-small",
            "input": texts,
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(url, json=payload, headers=headers)
            res.raise_for_status()
            data = res.json()
        rows = data.get("data") or []
        rows.sort(key=lambda r: int(r.get("index", 0)))
        return [list(r.get("embedding") or []) for r in rows]

    async def _complete_openai(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        response_format: dict[str, str] | None,
        timeout: float,
        cache_system_prompt: bool = False,
    ) -> str:
        url = f"{self._base_url}/chat/completions"
        payload: dict[str, Any] = {
            "model": self._model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        if response_format is not None:
            payload["response_format"] = response_format
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=_httpx_timeout(timeout)) as client:
            res = await client.post(url, json=payload, headers=headers)
            res.raise_for_status()
            data = res.json()
        if cache_system_prompt:
            _log_openai_cached_usage(data.get("usage"))
        return (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )

    async def _complete_anthropic(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        timeout: float,
        cache_system_prompt: bool = False,
    ) -> str:
        url = f"{self._base_url}/v1/messages"
        system_field: str | list[dict[str, Any]]
        if cache_system_prompt:
            system_field = [
                {
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ]
        else:
            system_field = system_prompt
        payload: dict[str, Any] = {
            "model": self._model,
            "max_tokens": self._max_tokens,
            "temperature": temperature,
            "system": system_field,
            "messages": [{"role": "user", "content": user_prompt}],
        }
        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": _ANTHROPIC_VERSION,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=_httpx_timeout(timeout)) as client:
            res = await client.post(url, json=payload, headers=headers)
            if res.is_error:
                detail = _anthropic_error_message(res)
                raise RuntimeError(
                    f"Anthropic API error ({res.status_code}): {detail}"
                ) from None
            data = res.json()
        if cache_system_prompt:
            _log_anthropic_cached_usage(data.get("usage"))
        blocks = data.get("content") or []
        parts: list[str] = []
        for block in blocks:
            if isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts).strip()


def _httpx_timeout(seconds: float) -> httpx.Timeout:
    """Separate connect budget from long LLM read/generation time."""
    return httpx.Timeout(seconds, connect=30.0)


def _anthropic_error_message(res: httpx.Response) -> str:
    try:
        body = res.json()
        err = body.get("error")
        if isinstance(err, dict):
            msg = err.get("message")
            if isinstance(msg, str) and msg.strip():
                return msg.strip()
    except Exception:  # noqa: BLE001
        pass
    return (res.text or res.reason_phrase or "unknown error")[:500]


def _normalize_provider(provider: str) -> LlmProvider:
    normalized = (provider or "openai").strip().lower()
    if normalized in {"anthropic", "claude"}:
        return "anthropic"
    return "openai"


def _log_anthropic_cached_usage(usage: Any) -> None:
    if not isinstance(usage, dict):
        return
    logger.info(
        "Anthropic prompt cache usage",
        extra={
            "input_tokens": usage.get("input_tokens"),
            "cache_creation_input_tokens": usage.get("cache_creation_input_tokens"),
            "cache_read_input_tokens": usage.get("cache_read_input_tokens"),
            "output_tokens": usage.get("output_tokens"),
        },
    )


def _log_openai_cached_usage(usage: Any) -> None:
    if not isinstance(usage, dict):
        return
    details = usage.get("prompt_tokens_details")
    cached = None
    if isinstance(details, dict):
        cached = details.get("cached_tokens")
    logger.info(
        "OpenAI completion usage",
        extra={
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "cached_prompt_tokens": cached,
        },
    )

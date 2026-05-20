"""Tests for provider prompt caching on LLM client."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from app.integrations.llm_client import LlmClient


def test_anthropic_complete_text_sends_cache_control_on_system():
    client = LlmClient(
        api_key="test-key",
        model="claude-sonnet-4-6",
        provider="anthropic",
    )
    response = httpx.Response(
        200,
        json={
            "content": [{"type": "text", "text": "ok"}],
            "usage": {
                "input_tokens": 10,
                "cache_creation_input_tokens": 5000,
                "cache_read_input_tokens": 0,
                "output_tokens": 5,
            },
        },
        request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"),
    )

    mock_post = AsyncMock(return_value=response)
    mock_client = MagicMock()
    mock_client.post = mock_post
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch(
        "app.integrations.llm_client.httpx.AsyncClient",
        return_value=mock_client,
    ):
        out = asyncio.run(
            client.complete_text(
                system_prompt="static system block",
                user_prompt="dynamic user",
                cache_system_prompt=True,
            )
        )

    assert out == "ok"
    payload = mock_post.await_args.kwargs["json"]
    system = payload["system"]
    assert isinstance(system, list)
    assert system[0]["cache_control"] == {"type": "ephemeral"}
    assert system[0]["text"] == "static system block"


def test_anthropic_complete_text_plain_system_when_cache_disabled():
    client = LlmClient(
        api_key="test-key",
        model="claude-sonnet-4-6",
        provider="anthropic",
    )
    response = httpx.Response(
        200,
        json={"content": [{"type": "text", "text": "ok"}]},
        request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"),
    )

    mock_post = AsyncMock(return_value=response)
    mock_client = MagicMock()
    mock_client.post = mock_post
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch(
        "app.integrations.llm_client.httpx.AsyncClient",
        return_value=mock_client,
    ):
        asyncio.run(
            client.complete_text(
                system_prompt="plain",
                user_prompt="user",
                cache_system_prompt=False,
            )
        )

    payload = mock_post.await_args.kwargs["json"]
    assert payload["system"] == "plain"

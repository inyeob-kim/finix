import pytest

from app.integrations.llm_client import LlmClient, _normalize_provider


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("openai", "openai"),
        ("anthropic", "anthropic"),
        ("claude", "anthropic"),
        ("Anthropic", "anthropic"),
    ],
)
def test_normalize_provider(raw: str, expected: str) -> None:
    assert _normalize_provider(raw) == expected


def test_anthropic_client_uses_anthropic_base_url() -> None:
    client = LlmClient(
        api_key="test-key",
        model="claude-sonnet-4-6",
        provider="anthropic",
    )
    assert client._base_url == "https://api.anthropic.com"
    assert client._provider == "anthropic"


def test_embed_texts_rejects_anthropic_provider() -> None:
    client = LlmClient(
        api_key="test-key",
        model="claude-sonnet-4-6",
        provider="anthropic",
    )
    with pytest.raises(RuntimeError, match="does not provide embeddings"):
        import asyncio

        asyncio.run(client.embed_texts(["hello"]))

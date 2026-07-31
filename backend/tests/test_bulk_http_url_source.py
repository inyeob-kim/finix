"""HTTP URL bulk source unit tests."""

from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.domain.bxcm_log.sources.http_url import fetch_bulk_log_url


def test_fetch_bulk_log_url_returns_text():
    mock_response = MagicMock()
    mock_response.text = '{"exchanges":[]}'
    mock_response.raise_for_status = MagicMock()

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = None
    mock_client.get.return_value = mock_response

    with patch("app.domain.bxcm_log.sources.http_url.httpx.Client", return_value=mock_client):
        text = fetch_bulk_log_url("https://example.com/dump.json")

    assert text == '{"exchanges":[]}'
    mock_client.get.assert_called_once_with("https://example.com/dump.json")


def test_fetch_bulk_log_url_raises_on_http_error():
    mock_response = MagicMock()
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "boom",
        request=MagicMock(),
        response=MagicMock(status_code=404),
    )

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = None
    mock_client.get.return_value = mock_response

    with patch("app.domain.bxcm_log.sources.http_url.httpx.Client", return_value=mock_client):
        with pytest.raises(httpx.HTTPStatusError):
            fetch_bulk_log_url("https://example.com/missing")

"""Live HTTP scenario runner helpers."""

from unittest.mock import MagicMock, patch

from app.domain.postman_collection_config import (
    PostmanCollectionConfig,
    PostmanStartVarSpec,
)
from app.models.fnx_testcase import FnxTestcase
from app.domain.step_http_result import StepHttpResult
from app.services.http_scenario_runner import (
    execute_http_testcase,
    initial_context_from_postman,
    join_base_url_and_endpoint,
    make_live_response_callback,
)


def _tc(tid: int, *, method: str = "POST", endpoint: str = "/v1/x") -> FnxTestcase:
    return FnxTestcase(
        inst_cd="1001",
        svc_code="SVC",
        rule_case_id=f"C-{tid}",
        name=f"TC-{tid}",
        http_method=method,
        endpoint=endpoint,
        request_body_json="{}",
        expected_status=200,
        expected_body_json="{}",
    )


def test_initial_context_from_postman():
    cfg = PostmanCollectionConfig(
        start_vars=[PostmanStartVarSpec(key="custId", value="C-1")],
    )
    ctx = initial_context_from_postman(cfg)
    assert ctx["custId"] == "C-1"
    assert "instCd" not in ctx
    assert initial_context_from_postman(None) == {}


def test_initial_context_allows_collection_txDt_separate_from_header():
    cfg = PostmanCollectionConfig(
        header_vars=[PostmanStartVarSpec(key="txDt", value="20260101")],
        start_vars=[PostmanStartVarSpec(key="txDt", value="20991231")],
    )
    ctx = initial_context_from_postman(cfg)
    assert ctx["txDt"] == "20991231"


def test_join_base_url_and_endpoint():
    assert (
        join_base_url_and_endpoint("https://api.test", "/v1/withdraw")
        == "https://api.test/v1/withdraw"
    )
    assert join_base_url_and_endpoint("https://api.test/", "v1/x") == "https://api.test/v1/x"


def test_execute_http_testcase_uses_httpx():
    tc = _tc(1, endpoint="/v1/withdraw")
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"ok": True}
    mock_response.content = b'{"ok": true}'
    mock_client = MagicMock()
    mock_client.request.return_value = mock_response
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("app.services.http_scenario_runner.httpx.Client", return_value=mock_client):
        result = execute_http_testcase(
            tc,
            base_url="https://api.test",
            request_body={"amount": 100},
            headers=[{"key": "Content-Type", "value": "application/json"}],
        )

    assert isinstance(result, StepHttpResult)
    assert result.status == 200
    assert result.body == {"ok": True}
    assert result.response_time_ms is not None
    assert result.response_size_bytes == len(b'{"ok": true}')
    assert result.method == "POST"
    assert result.request_url == "https://api.test/v1/withdraw"
    mock_client.request.assert_called_once_with(
        "POST",
        "https://api.test/v1/withdraw",
        json={"amount": 100},
        headers={"Content-Type": "application/json"},
    )


def test_make_live_response_callback_delegates():
    tc = _tc(1, method="GET", endpoint="/health")
    with patch(
        "app.services.http_scenario_runner.execute_http_testcase",
        return_value=StepHttpResult(status=204, body={}),
    ) as mock_exec:
        callback = make_live_response_callback(
            base_url="https://api.test",
            postman_config=None,
        )
        result = callback(tc, {"x": 1})

    assert isinstance(result, StepHttpResult)
    assert result.status == 204
    mock_exec.assert_called_once()
    call_kw = mock_exec.call_args.kwargs
    assert call_kw["base_url"] == "https://api.test"
    assert call_kw["request_body"] == {"x": 1}
    assert any(h["key"] == "x-bxm-systemheader" for h in call_kw["headers"])

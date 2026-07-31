"""Unit tests for Bxcm / transaction log parser."""

from app.domain.bxcm_log.parser import parse_log_text


def test_parse_structured_json_exchanges():
    text = """
    {
      "exchanges": [
        {
          "method": "POST",
          "endpoint": "/cbs/py016",
          "http_status": 200,
          "service_code": "PY016",
          "cbb_header": {"staffId": "1100000001", "txDt": "20260730", "srvcCd": "PY016"},
          "request_body": {"custId": "C1"},
          "response_body": {"txDt": "20260730"}
        },
        {
          "method": "POST",
          "endpoint": "/cbs/py016",
          "http_status": 500,
          "service_code": "PY016",
          "request_body": {"custId": null},
          "response_body": {"messageId": "E_INVALID_ACCT"}
        }
      ]
    }
    """
    rows = parse_log_text(text)
    assert len(rows) == 2
    assert rows[0].path_kind == "happy"
    assert rows[1].path_kind == "negative"
    assert rows[1].biz_error_code == "E_INVALID_ACCT"


def test_parse_http_text_heuristic():
    text = """
    POST /api/transfer
    status: 200
    srvcCd: TR001
    {"amount": 100}
    {"result": "ok"}
    """
    rows = parse_log_text(text)
    assert len(rows) >= 1
    assert rows[0].method == "POST"
    assert rows[0].endpoint.startswith("/api/transfer")

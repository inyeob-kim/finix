"""Default FCC Postman request headers."""

from datetime import date

from app.domain.postman_collection_config import PostmanCollectionConfig
from app.domain.postman_default_headers import (
    build_postman_request_headers,
    default_postman_header_specs,
    fcc_tx_date_today,
)


def test_default_headers_include_fcc_channel_fields():
    rows = default_postman_header_specs()
    keys = [r.key for r in rows]
    assert keys[:5] == [
        "Content-Type",
        "instCd",
        "deptId",
        "txDt",
        "staffId",
    ]
    assert "aprvlId" in keys
    assert rows[0].value == "application/json"
    assert rows[1].value == "1001"
    assert rows[2].value == "10001"
    assert rows[3].value == fcc_tx_date_today()
    assert rows[4].value == "1000013"


def test_build_postman_request_headers_refreshes_tx_dt():
    stale = [
        row.model_copy(update={"value": "19990101"})
        if row.key == "txDt"
        else row
        for row in default_postman_header_specs()
    ]
    built = build_postman_request_headers(stale)
    tx = next(h for h in built if h["key"] == "txDt")
    assert tx["value"] == date.today().strftime("%Y%m%d")


def test_build_postman_request_headers_uses_config():
    cfg = PostmanCollectionConfig(default_headers=[])
    built = build_postman_request_headers(cfg.default_headers)
    assert len(built) >= 8
    assert built[0] == {"key": "Content-Type", "value": "application/json"}


def test_empty_config_headers_falls_back_to_defaults():
    built = build_postman_request_headers(None)
    assert any(h["key"] == "scrnId" for h in built)
    assert next(h for h in built if h["key"] == "instCd")["value"] == "1001"

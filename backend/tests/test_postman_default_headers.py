"""Default Postman request headers for FCC-style API collections."""

from datetime import date

from app.domain.postman_collection_config import PostmanCollectionConfig, PostmanHeaderSpec
from app.domain.postman_default_headers import (
    build_postman_request_headers,
    default_postman_header_specs,
    fcc_tx_date_today,
    refresh_tx_dt_header_value,
)


def test_default_headers_content_type_only():
    rows = default_postman_header_specs()
    assert len(rows) == 1
    assert rows[0].key == "Content-Type"
    assert rows[0].value == "application/json"


def test_refresh_tx_dt_header_value_updates_stale_row():
    stale = [
        PostmanHeaderSpec(key="Content-Type", value="application/json"),
        PostmanHeaderSpec(key="txDt", value="19990101"),
    ]
    refreshed = refresh_tx_dt_header_value(stale)
    tx = next(r for r in refreshed if r.key == "txDt")
    assert tx.value == date.today().strftime("%Y%m%d")


def test_build_postman_request_headers_uses_config():
    cfg = PostmanCollectionConfig(default_headers=[])
    built = build_postman_request_headers(cfg.default_headers)
    assert built == []


def test_empty_config_headers_falls_back_to_content_type():
    built = build_postman_request_headers(None)
    assert built == [{"key": "Content-Type", "value": "application/json"}]

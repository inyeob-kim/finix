"""Tests for Postman URL path extraction and catalog URI matching."""

from app.domain.service_uri_match import extract_service_path, match_service_code


def test_extract_service_path_strips_base_url_var():
    assert (
        extract_service_path("{{baseUrl}}/PaymentTransfer/StandingOrder/Open")
        == "/PaymentTransfer/StandingOrder/Open"
    )


def test_extract_service_path_strips_scheme_host_and_query():
    assert (
        extract_service_path(
            "https://cbs.example/PaymentTransfer/StandingOrder/Open?x=1"
        )
        == "/PaymentTransfer/StandingOrder/Open"
    )


def test_extract_service_path_from_postman_url_object():
    assert (
        extract_service_path(
            {
                "raw": "{{host}}/foo/Bar",
                "host": ["{{host}}"],
                "path": ["foo", "Bar"],
            }
        )
        == "/foo/Bar"
    )


def test_match_service_code_by_uri_suffix():
    catalog = {
        "STO001": "/PaymentTransfer/StandingOrder/Open",
        "OTHER": "/Other/Path",
    }
    assert (
        match_service_code(
            path="/PaymentTransfer/StandingOrder/Open",
            catalog_uris=catalog,
        )
        == "STO001"
    )
    assert (
        match_service_code(
            path="/prefix/PaymentTransfer/StandingOrder/Open",
            catalog_uris=catalog,
        )
        == "STO001"
    )


def test_match_service_code_by_operation_id():
    catalog = {"STO001": "/ignored"}
    assert (
        match_service_code(
            path="/nope",
            catalog_uris=catalog,
            operation_id="STO001",
        )
        == "STO001"
    )

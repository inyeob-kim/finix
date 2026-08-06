"""Promote naming / expected mapping for pool samples."""

from app.models.fnx_pool_sample import PoolSample
from app.services.pool_promote_service import _display_name, _expected_for_sample


def test_display_name_happy_and_negative():
    happy = PoolSample(
        method="POST",
        endpoint="/x",
        path_kind="happy",
        source="paste",
        source_fingerprint="a" * 64,
        service_code="PY016",
    )
    happy.id = 7
    assert _display_name(happy).startswith("[N]")
    neg = PoolSample(
        method="POST",
        endpoint="/x",
        path_kind="negative",
        source="paste",
        source_fingerprint="b" * 64,
        service_code="PY016",
        biz_error_code="E_INVALID_ACCT",
    )
    neg.id = 8
    assert _display_name(neg) == "[E] E_INVALID_ACCT · PY016"


def test_expected_negative_defaults_http_500():
    neg = PoolSample(
        method="POST",
        endpoint="/x",
        path_kind="negative",
        source="paste",
        source_fingerprint="c" * 64,
        biz_error_code="E1",
        response_body_json='{"messageId":"E1"}',
    )
    status, body = _expected_for_sample(neg)
    assert status == 500
    assert body["error_code"] == "E1"

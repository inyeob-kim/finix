"""Template-driven HTTP test definitions keyed by scenario step keywords.

New flows should be registered here instead of hardcoding in services
(architecture: extensibility via configuration).
"""

from __future__ import annotations

from typing import Any, TypedDict


class HttpTestTemplate(TypedDict):
    """Single API test template used when materializing test cases."""

    name: str
    method: str
    endpoint: str
    request_body: dict[str, Any]
    expected_status: int
    expected_body: dict[str, Any]


def _customer_create() -> HttpTestTemplate:
    return {
        "name": "고객 생성",
        "method": "POST",
        "endpoint": "/api/customer",
        "request_body": {
            "name": "홍길동",
            "email": "hong@example.com",
            "account_type": "checking",
        },
        "expected_status": 201,
        "expected_body": {
            "id": "cust_123",
            "name": "홍길동",
            "email": "hong@example.com",
        },
    }


def _deposit() -> HttpTestTemplate:
    return {
        "name": "정기예금 생성",
        "method": "POST",
        "endpoint": "/api/deposit",
        "request_body": {
            "customer_id": "cust_123",
            "amount": 1000,
            "currency": "KRW",
        },
        "expected_status": 200,
        "expected_body": {"balance": 1000, "transaction_id": "txn_456"},
    }


def _withdraw_insufficient() -> HttpTestTemplate:
    return {
        "name": "출금 (잔액 부족)",
        "method": "POST",
        "endpoint": "/api/withdraw",
        "request_body": {
            "customer_id": "cust_123",
            "amount": 5000,
            "currency": "KRW",
        },
        "expected_status": 400,
        "expected_body": {
            "error": "insufficient_funds",
            "message": "잔액 부족으로 출금할 수 없습니다",
        },
    }


def _withdraw_success() -> HttpTestTemplate:
    return {
        "name": "출금",
        "method": "POST",
        "endpoint": "/api/withdraw",
        "request_body": {
            "customer_id": "cust_123",
            "amount": 100,
            "currency": "KRW",
        },
        "expected_status": 200,
        "expected_body": {"balance": 900, "transaction_id": "txn_789"},
    }


def template_for_step_action(action: str, step_result: str) -> HttpTestTemplate:
    """
    Resolve an HTTP test template from a scenario step label and outcome.

    Args:
        action: Human-readable step title (Korean or English).
        step_result: ``success`` or ``error`` from the scenario step.

    Returns:
        A concrete template; falls back to a generic probe when unknown.
    """
    a = action.lower()
    if "고객" in action or "customer" in a:
        return _customer_create()
    if "예금" in action or "입금" in action or "deposit" in a:
        return _deposit()
    if "출금" in action or "withdraw" in a:
        if step_result == "error":
            return _withdraw_insufficient()
        return _withdraw_success()
    return {
        "name": action[:120] or "API 호출",
        "method": "GET",
        "endpoint": "/api/health",
        "request_body": {},
        "expected_status": 200,
        "expected_body": {"status": "ok"},
    }

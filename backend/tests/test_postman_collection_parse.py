"""Tests for Postman Collection / Request parsing."""

from app.domain.postman_collection_parse import parse_collection_requests


def test_parse_single_request_export():
    payload = {
        "name": "Open SO",
        "request": {
            "method": "POST",
            "url": "{{baseUrl}}/PaymentTransfer/StandingOrder/Open",
            "body": {
                "mode": "raw",
                "raw": '{"acctNbr":"1"}',
            },
            "description": "happy path",
        },
    }
    rows = parse_collection_requests(payload)
    assert len(rows) == 1
    assert rows[0].name == "Open SO"
    assert rows[0].path == "/PaymentTransfer/StandingOrder/Open"
    assert rows[0].body == {"acctNbr": "1"}
    assert rows[0].description == "happy path"
    assert rows[0].index == 0


def test_parse_collection_nested_folders():
    payload = {
        "info": {"name": "col"},
        "item": [
            {
                "name": "Standing",
                "item": [
                    {
                        "name": "fail insufficient",
                        "request": {
                            "method": "post",
                            "url": {
                                "raw": "http://h/PaymentTransfer/StandingOrder/Open",
                                "path": [
                                    "PaymentTransfer",
                                    "StandingOrder",
                                    "Open",
                                ],
                            },
                            "body": {"mode": "raw", "raw": "{}"},
                        },
                        "event": [
                            {
                                "listen": "test",
                                "script": {
                                    "exec": ["pm.test('x', function(){});"]
                                },
                            }
                        ],
                    }
                ],
            }
        ],
    }
    rows = parse_collection_requests(payload)
    assert len(rows) == 1
    assert rows[0].folder == "Standing"
    assert rows[0].method == "POST"
    assert "pm.test" in rows[0].test_script_excerpt


def test_parse_body_quotes_bare_macros():
    payload = {
        "name": "upd",
        "request": {
            "method": "POST",
            "url": "/LM000",
            "body": {
                "mode": "raw",
                "raw": '{\n  "aplyStartDt": {{txDt}},\n  "lmtAmt": 1\n}',
            },
        },
    }
    rows = parse_collection_requests(payload)
    assert rows[0].body["aplyStartDt"] == "{{txDt}}"
    assert rows[0].body["lmtAmt"] == 1


def test_parse_body_strips_js_line_comments():
    """Postman raw bodies often include // comments which are not valid JSON."""
    payload = {
        "info": {"name": "t"},
        "item": [
            {
                "name": "Update Copy",
                "request": {
                    "method": "POST",
                    "url": "{{baseUrl}}/Limit/LimitManagement/Register",
                    "body": {
                        "mode": "raw",
                        "raw": (
                            '{\n  "lmtTpCd": "03",\n  "items": [{\n'
                            '    "lmtId": "{{bankLimitLmtId}}",\n'
                            '    "lmtAmt": 150000000.00, // balance update\n'
                            '    "rmkCntnt": "postman update test",// delete\n'
                            '    "crudType": "U"\n'
                            "  }]\n}"
                        ),
                    },
                },
            }
        ],
    }
    rows = parse_collection_requests(payload)
    assert rows[0].body["lmtTpCd"] == "03"
    assert rows[0].body["items"][0]["lmtAmt"] == 150000000.00
    assert rows[0].body["items"][0]["crudType"] == "U"
    assert rows[0].body["items"][0]["lmtId"] == "{{bankLimitLmtId}}"


def test_apply_create_reuses_sibling_body_when_empty():
    from app.domain.postman_collection_parse import PostmanRequestCandidate
    from app.domain.postman_rules_merge import apply_create_plan

    candidates = [
        PostmanRequestCandidate(
            index=0,
            name="Create",
            folder="",
            method="POST",
            path="/LM000",
            body={"lmtTpCd": "03", "lmtAmt": 1},
            description="",
            test_script_excerpt="",
        ),
        PostmanRequestCandidate(
            index=1,
            name="Update Copy",
            folder="",
            method="POST",
            path="/LM000",
            body={},
            description="",
            test_script_excerpt="",
        ),
    ]
    payload, diff = apply_create_plan(
        service_code="LM000",
        service_name="Bank Limit",
        candidates=candidates,
        plan=None,
        skeleton={},
    )
    assert payload.rules[1]["input"]["lmtTpCd"] == "03"
    assert any("body empty" in n for n in diff.notes)


def test_fallback_create_marks_bizrule_folder_as_error():
    from app.domain.postman_collection_parse import PostmanRequestCandidate
    from app.domain.postman_rules_merge import apply_create_plan

    candidates = [
        PostmanRequestCandidate(
            index=0,
            name="03_Cancel_BizRuleViolation",
            folder="00_Scenarios/40_BankSalary/SalaryPayment/BizRule",
            method="POST",
            path="/Payment/BankSalaryPayment/Cancel",
            body={},
            description="",
            test_script_excerpt="",
        ),
    ]
    payload, _diff = apply_create_plan(
        service_code="PY022",
        service_name="Cancel",
        candidates=candidates,
        plan=None,
        skeleton={},
    )
    assert payload.rules[0]["rule_type"] == "E"
    assert payload.rules[0]["expect"]["outcome"] == "error"
    assert "BizRule" in payload.rules[0]["description"]

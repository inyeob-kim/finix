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


def test_parse_body_strips_trailing_commas():
    """Postman/JS-style trailing commas must not yield empty input."""
    payload = {
        "name": "01_Issue_CashiersCheque (for payment)",
        "request": {
            "method": "POST",
            "url": "{{baseUrl}}/Payment/CashiersCheque/Issue",
            "body": {
                "mode": "raw",
                "raw": (
                    "{\n"
                    '  "cashTrnsfrDscd": "2",\n'
                    '  "custId": "{{custId}}",\n'
                    '  "whdrwlAcctNbr": "{{srcAcctNbr}}",\n'
                    '  "txRmkCntnt": "CHECK ISSUANCE POSTMAN TEST",\n'
                    '  "chkList": [\n'
                    "    {\n"
                    '      "chequeNbr": "{{startNbr}}",\n'
                    '      "chequeAmt": 10000,\n'
                    "    },\n"
                    "  ],\n"
                    "}"
                ),
            },
        },
    }
    rows = parse_collection_requests(payload)
    assert rows[0].body["cashTrnsfrDscd"] == "2"
    assert rows[0].body["chkList"] == [
        {"chequeNbr": "{{startNbr}}", "chequeAmt": 10000}
    ]


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


def test_apply_create_preserves_body_with_sparse_global_indices():
    """Service-group lists keep collection-wide index values; must not use as list pos."""
    from app.domain.postman_collection_parse import PostmanRequestCandidate
    from app.domain.postman_rules_merge import apply_create_plan, reindex_candidates
    from app.domain.postman_rules_plans import (
        CreateCaseSpec,
        CreatePlan,
        ExpectHint,
    )

    body = {
        "pymntDt": "",
        "pymntRmkCntnt": "",
        "bsicAtchmntFileId": "",
        "dtlAtchmntFileId": "",
    }
    sparse = [
        PostmanRequestCandidate(
            index=40,
            name="Happy",
            folder="Happy",
            method="POST",
            path="/bank-salaries/requests",
            body={"pymntDt": "20260101"},
            description="",
            test_script_excerpt="",
        ),
        PostmanRequestCandidate(
            index=47,
            name="01_Request_MissingRequired(pymntDt)",
            folder="00_Scenarios/40_BankSalary/SalaryPayment/Validation",
            method="POST",
            path="/bank-salaries/requests",
            body=body,
            description="",
            test_script_excerpt="",
        ),
    ]

    # Fallback create with sparse indices (pre-reindex bug regression)
    payload, _diff = apply_create_plan(
        service_code="PY016",
        service_name="Request",
        candidates=sparse,
        plan=None,
        skeleton={},
    )
    by_title = {r["title"]: r for r in payload.rules}
    assert by_title["Happy"]["input"] == {"pymntDt": "20260101"}
    assert by_title["01_Request_MissingRequired(pymntDt)"]["input"] == body

    # AI plan referring to global index 47
    plan = CreatePlan(
        cases=[
            CreateCaseSpec(
                candidate_indices=[47],
                rule_type="E",
                title="필수 지급일 누락",
                description="pymntDt 누락",
                expect_hint=ExpectHint(outcome="error", http_status=400),
                rationale="test",
            )
        ]
    )
    payload2, _ = apply_create_plan(
        service_code="PY016",
        service_name="Request",
        candidates=sparse,
        plan=plan,
        skeleton={},
    )
    assert payload2.rules[0]["input"] == body
    assert "MissingRequired" in payload2.rules[0]["source_evidence"]["snippet"]

    # After reindex, local indices 0..n-1 also work
    local = reindex_candidates(sparse)
    assert [c.index for c in local] == [0, 1]
    plan_local = CreatePlan(
        cases=[
            CreateCaseSpec(
                candidate_indices=[1],
                rule_type="E",
                title="필수 지급일 누락",
                description="pymntDt 누락",
                expect_hint=ExpectHint(outcome="error", http_status=400),
                rationale="test",
            )
        ]
    )
    payload3, _ = apply_create_plan(
        service_code="PY016",
        service_name="Request",
        candidates=local,
        plan=plan_local,
        skeleton={},
    )
    assert payload3.rules[0]["input"] == body

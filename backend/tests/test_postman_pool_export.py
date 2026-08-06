"""Pool / standalone Postman export includes BXM scripts and response tests."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.testcase_service import TestCaseService


def _tc(
    *,
    id: int,
    name: str,
    endpoint: str = "/api/x",
    expected_status: int = 200,
    request_body: str = "{}",
    expected_body: str = '{"outcome":"success"}',
) -> SimpleNamespace:
    return SimpleNamespace(
        inst_cd="1001",
        svc_code="PY025",
        rule_case_id=f"C-{id}",
        name=name,
        http_method="POST",
        endpoint=endpoint,
        request_body_json=request_body,
        expected_status=expected_status,
        expected_body_json=expected_body,
    )


def test_pool_export_includes_bxm_event_variables_and_item_scripts():
    service = TestCaseService(
        metadata_repo=None,  # type: ignore[arg-type]
        registry_repo=None,  # type: ignore[arg-type]
        cbs_catalog_repo=None,  # type: ignore[arg-type]
    )
    rows = [
        _tc(id=1, name="[N] PY025-N-001 · happy"),
        _tc(
            id=2,
            name="[E] PY025-E-001 · fail",
            expected_status=400,
            expected_body='{"outcome":"error"}',
        ),
    ]
    payload = service.build_postman_for_pool_testcases(
        rows,  # type: ignore[arg-type]
        collection_title="FinTest Service — PY025",
        service_code_hint="PY025",
    )

    assert payload["info"]["name"] == "FinTest Service — PY025"
    assert len(payload["item"]) == 2

    variables = {row["key"]: row["value"] for row in payload.get("variable", [])}
    assert "baseUrl" in variables

    collection_events = payload.get("event") or []
    assert any(ev.get("listen") == "prerequest" for ev in collection_events)
    prerequest_exec = "\n".join(
        line
        for ev in collection_events
        if ev.get("listen") == "prerequest"
        for line in (ev.get("script") or {}).get("exec") or []
    )
    assert "x-bxm-systemheader" in prerequest_exec
    assert "_bxm_srvcCd" in prerequest_exec

    first = payload["item"][0]
    assert first["request"]["header"] == [
        {"key": "Content-Type", "value": "application/json"},
    ]
    item_events = first.get("event") or []
    listens = {ev.get("listen") for ev in item_events}
    assert "prerequest" in listens
    assert "test" in listens
    item_pre = "\n".join(
        line
        for ev in item_events
        if ev.get("listen") == "prerequest"
        for line in (ev.get("script") or {}).get("exec") or []
    )
    assert "PY025" in item_pre
    item_test = "\n".join(
        line
        for ev in item_events
        if ev.get("listen") == "test"
        for line in (ev.get("script") or {}).get("exec") or []
    )
    assert "pm.test" in item_test


def test_pool_export_keeps_macros_as_collection_variables():
    service = TestCaseService(
        metadata_repo=None,  # type: ignore[arg-type]
        registry_repo=None,  # type: ignore[arg-type]
        cbs_catalog_repo=None,  # type: ignore[arg-type]
    )
    rows = [
        _tc(
            id=1,
            name="[N] PY025-N-001 · happy",
            request_body=(
                '{"frstNm":"{{$generator.name()}}",'
                '"pymntDt":"{{$date.today()}}"}'
            ),
        ),
    ]
    payload = service.build_postman_for_pool_testcases(
        rows,  # type: ignore[arg-type]
        collection_title="FinTest Service — PY025",
        service_code_hint="PY025",
    )

    raw = payload["item"][0]["request"]["body"]["raw"]
    assert "{{gen_name}}" in raw
    assert "{{date_today}}" in raw
    assert "{{$generator.name()}}" not in raw
    # Must not bake a resolved Korean name into the body
    assert "민준" not in raw and "서연" not in raw

    variables = {row["key"] for row in payload.get("variable", [])}
    assert "gen_name" in variables
    assert "date_today" in variables

    prerequest_exec = "\n".join(
        line
        for ev in (payload.get("event") or [])
        if ev.get("listen") == "prerequest"
        for line in (ev.get("script") or {}).get("exec") or []
    )
    assert 'pm.collectionVariables.set("gen_name"' in prerequest_exec
    assert 'pm.collectionVariables.set("date_today"' in prerequest_exec
    assert "YAML dynamic macros" in prerequest_exec

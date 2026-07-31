"""BXMC x-bxm-systemheader generation."""

import base64
import json

from app.domain.postman_bxm_system_header import (
    BXM_HEADER_NAME,
    BXM_ITEM_SRVC_CD_VAR,
    bxm_prerequest_collection_event,
    build_bxm_system_header_value,
    build_live_http_headers,
    collection_start_vars,
    ensure_bxm_header_vars,
    ensure_bxm_start_vars,
    extract_service_code_from_testcase_name,
)
from app.domain.postman_collection_config import PostmanCollectionConfig
from app.domain.postman_collection_variables import build_postman_collection_variables


def test_build_bxm_system_header_base64_roundtrip():
    encoded = build_bxm_system_header_value(
        inst_cd="1001",
        chnl_dscd="01",
        dept_id="10001",
        staff_id="1100000013",
        lng_cd="ko",
        tx_dt="20260604",
        srvc_cd="PY025",
        scrn_id="SCR001",
    )
    decoded = json.loads(base64.b64decode(encoded).decode("utf-8"))
    assert decoded["instCd"] == "1001"
    assert decoded["srvcCd"] == "PY025"
    assert decoded["txDt"] == "20260604"


def test_live_http_headers_include_bxm_header():
    headers = build_live_http_headers(
        PostmanCollectionConfig(),
        service_code="PY025",
    )
    keys = [h["key"] for h in headers]
    assert "Content-Type" in keys
    assert BXM_HEADER_NAME in keys
    bxm = next(h for h in headers if h["key"] == BXM_HEADER_NAME)
    payload = json.loads(base64.b64decode(bxm["value"]).decode("utf-8"))
    assert payload["srvcCd"] == "PY025"


def test_collection_variables_exclude_bxm_defaults():
    vars_ = build_postman_collection_variables(PostmanCollectionConfig(), runtime_var_names=[])
    keys = [v["key"] for v in vars_]
    assert keys[0] == "baseUrl"
    assert "instCd" not in keys
    assert "lngCd" not in keys


def test_collection_variables_allow_txDt_alongside_header():
    cfg = PostmanCollectionConfig(
        header_vars=[{"key": "txDt", "value": "20260101"}],
        start_vars=[{"key": "txDt", "value": "20991231"}],
    )
    vars_ = build_postman_collection_variables(cfg, runtime_var_names=[])
    tx = next(v for v in vars_ if v["key"] == "txDt")
    assert tx["value"] == "20991231"
    header_tx = next(r for r in ensure_bxm_header_vars(cfg) if r.key == "txDt")
    assert header_tx.value == "20260101"


def test_extract_service_code_from_testcase_name():
    assert extract_service_code_from_testcase_name("[E] PY025-E-001 · dt 누락") == "PY025"


def test_prerequest_event_bakes_header_vars():
    cfg = PostmanCollectionConfig(
        header_vars=[{"key": "instCd", "value": "2002"}],
    )
    ev = bxm_prerequest_collection_event(cfg)
    assert ev["listen"] == "prerequest"
    script = "\n".join(ev["script"]["exec"])
    assert "x-bxm-systemheader" in script
    assert "btoa" in script
    assert "2002" in script
    assert BXM_ITEM_SRVC_CD_VAR in script
    assert 'pm.collectionVariables.get("instCd")' not in script


def test_ensure_bxm_start_vars_user_overrides_from_legacy_start_vars():
    cfg = PostmanCollectionConfig(
        start_vars=[{"key": "instCd", "value": "2002", "description": None}],
    )
    rows = ensure_bxm_start_vars(cfg)
    inst = next(r for r in rows if r.key == "instCd")
    assert inst.value == "2002"


def test_ensure_bxm_start_vars_migrates_legacy_staff_id():
    cfg = PostmanCollectionConfig(
        start_vars=[{"key": "staffId", "value": "1000013", "description": None}],
    )
    rows = ensure_bxm_start_vars(cfg)
    staff = next(r for r in rows if r.key == "staffId")
    assert staff.value == "1100000013"


def test_collection_start_vars_exclude_legacy_bxm_keys():
    cfg = PostmanCollectionConfig(
        start_vars=[
            {"key": "instCd", "value": "2002", "description": None},
            {"key": "custId", "value": "C-1", "description": None},
        ],
    )
    rows = collection_start_vars(cfg)
    keys = [r.key for r in rows]
    assert keys == ["custId"]
    assert next(r for r in rows if r.key == "custId").value == "C-1"

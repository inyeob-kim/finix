"""BXMC ``x-bxm-systemheader`` (base64 JSON) for Postman export and live HTTP."""

from __future__ import annotations

import base64
import json
import re
from typing import Any

from app.domain.postman_collection_config import PostmanCollectionConfig, PostmanStartVarSpec
from app.domain.postman_default_headers import fcc_tx_date_today
from app.models.testcase import TestCase

BXM_HEADER_NAME = "x-bxm-systemheader"
LEGACY_STAFF_ID_DEFAULT = "1000013"

# Collection variables required by the platform pre-request script.
BXM_CHANNEL_VAR_DEFAULTS: tuple[tuple[str, str], ...] = (
    ("instCd", "1001"),
    ("chnlDscd", "01"),
    ("deptId", "10001"),
    ("txDt", ""),
    ("staffId", "1100000013"),
    ("aprvlId", ""),
    ("srvcCd", ""),
    ("scrnId", ""),
    ("lngCd", "ko"),
)

_BXM_PREREQUEST_SCRIPT = """\
const srvcCd   = pm.collectionVariables.get("srvcCd") || '';
const scrnId   = pm.collectionVariables.get("scrnId") || '';
const today    = new Date();
const txDtStored = pm.collectionVariables.get("txDt") || '';
const txDt     = txDtStored.trim()
  ? txDtStored.trim()
  : today.getFullYear()
    + String(today.getMonth() + 1).padStart(2, '0')
    + String(today.getDate()).padStart(2, '0');

const enc_header = {
  instCd:  pm.collectionVariables.get("instCd"),
  chnlDscd: pm.collectionVariables.get("chnlDscd"),
  deptId:  pm.collectionVariables.get("deptId"),
  staffId: pm.collectionVariables.get("staffId"),
  lngCd:   pm.collectionVariables.get("lngCd"),
  txDt,
  srvcCd,
  scrnId
};

pm.request.headers.upsert({
  key: 'x-bxm-systemheader',
  value: btoa(JSON.stringify(enc_header))
});
console.log("enc_header = ", enc_header);
"""


def bxm_prerequest_collection_event() -> dict[str, Any]:
    """Postman collection-level pre-request script."""
    return {
        "listen": "prerequest",
        "script": {
            "type": "text/javascript",
            "exec": _BXM_PREREQUEST_SCRIPT.split("\n"),
        },
    }


def bxm_item_srvc_cd_prerequest(service_code: str) -> dict[str, Any] | None:
    """Set ``srvcCd`` collection variable before each request when known."""
    code = service_code.strip()
    if not code:
        return None
    safe = code.replace("\\", "\\\\").replace('"', '\\"')
    script = "\n".join(
        [
            f'pm.collectionVariables.set("srvcCd", "{safe}");',
            f'console.log("srvcCd set to {safe}");',
        ],
    )
    return {
        "listen": "prerequest",
        "script": {"type": "text/javascript", "exec": script.split("\n")},
    }


def ensure_bxm_start_vars(
    config: PostmanCollectionConfig | None,
) -> list[PostmanStartVarSpec]:
    """Merge platform channel defaults with user start_vars (user wins)."""
    cfg = config or PostmanCollectionConfig()
    by_key: dict[str, PostmanStartVarSpec] = {}

    for key, value in BXM_CHANNEL_VAR_DEFAULTS:
        default = fcc_tx_date_today() if key == "txDt" and not value else value
        by_key[key] = PostmanStartVarSpec(key=key, value=default)

    for row in cfg.start_vars:
        k = row.key.strip()
        if k:
            by_key[k] = row.model_copy(deep=True)

    # Legacy flat default_headers → seed collection vars when empty.
    for row in cfg.default_headers:
        k = row.key.strip()
        if not k or k not in by_key:
            continue
        if k in {
            "instCd", "deptId", "staffId", "srvcCd", "scrnId", "chnlDscd",
            "lngCd", "txDt", "aprvlId",
        }:
            if not by_key[k].value.strip() and row.value.strip():
                by_key[k] = by_key[k].model_copy(update={"value": row.value.strip()})

    staff = by_key.get("staffId")
    if staff and staff.value.strip() == LEGACY_STAFF_ID_DEFAULT:
        by_key["staffId"] = staff.model_copy(update={"value": "1100000013"})

    tx = by_key.get("txDt")
    if tx and not tx.value.strip():
        by_key["txDt"] = tx.model_copy(update={"value": fcc_tx_date_today()})

    bxm_keys = {key for key, _ in BXM_CHANNEL_VAR_DEFAULTS}
    result = [by_key[k] for k, _ in BXM_CHANNEL_VAR_DEFAULTS if k in by_key]
    for row in cfg.start_vars:
        k = row.key.strip()
        if k and k not in bxm_keys:
            result.append(row.model_copy(deep=True))
    return result


def bxm_var_map_from_config(
    config: PostmanCollectionConfig | None,
) -> dict[str, str]:
    """Resolve channel fields for live HTTP (collection start vars + defaults)."""
    rows = ensure_bxm_start_vars(config)
    out = {row.key: row.value for row in rows}
    for key, default in BXM_CHANNEL_VAR_DEFAULTS:
        out.setdefault(key, default)
    return out


def build_bxm_system_header_value(
    *,
    inst_cd: str,
    chnl_dscd: str,
    dept_id: str,
    staff_id: str,
    lng_cd: str,
    tx_dt: str,
    srvc_cd: str = "",
    scrn_id: str = "",
) -> str:
    """Return base64-encoded JSON for ``x-bxm-systemheader``."""
    payload = {
        "instCd": inst_cd,
        "chnlDscd": chnl_dscd,
        "deptId": dept_id,
        "staffId": staff_id,
        "lngCd": lng_cd,
        "txDt": tx_dt,
        "srvcCd": srvc_cd,
        "scrnId": scrn_id,
    }
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    return base64.b64encode(raw.encode("utf-8")).decode("ascii")


def build_bxm_system_header_from_vars(
    var_map: dict[str, str],
    *,
    service_code: str | None = None,
    tx_dt: str | None = None,
) -> str:
    """Build header from a flat string map (start_vars + overrides)."""
    srvc = (service_code or var_map.get("srvcCd") or "").strip()
    return build_bxm_system_header_value(
        inst_cd=var_map.get("instCd", "1001"),
        chnl_dscd=var_map.get("chnlDscd", "01"),
        dept_id=var_map.get("deptId", "10001"),
        staff_id=var_map.get("staffId", "1100000013"),
        lng_cd=var_map.get("lngCd", "ko"),
        tx_dt=tx_dt or var_map.get("txDt") or fcc_tx_date_today(),
        srvc_cd=srvc,
        scrn_id=var_map.get("scrnId", ""),
    )


def build_live_http_headers(
    config: PostmanCollectionConfig | None,
    *,
    service_code: str | None = None,
) -> list[dict[str, str]]:
    """Headers for in-app live execution (mirrors Postman pre-request)."""
    var_map = bxm_var_map_from_config(config)
    header_value = build_bxm_system_header_from_vars(
        var_map,
        service_code=service_code,
    )
    return [
        {"key": "Content-Type", "value": "application/json"},
        {"key": BXM_HEADER_NAME, "value": header_value},
    ]


def build_postman_export_request_headers() -> list[dict[str, str]]:
    """Minimal static headers; ``x-bxm-systemheader`` is set by collection script."""
    return [{"key": "Content-Type", "value": "application/json"}]


_SERVICE_CODE_RE = re.compile(r"\b([A-Z]{2}\d{3,})\b")


def extract_service_code_from_testcase_name(name: str) -> str | None:
    """Parse ``PY025`` from materialized names like ``[E] PY025-E-001 · ...``."""
    m = _SERVICE_CODE_RE.search(name or "")
    return m.group(1) if m else None


def service_code_for_testcase(
    testcase: TestCase,
    *,
    step_service_codes: dict[int, str] | None = None,
) -> str | None:
    """Resolve service code for a testcase row."""
    step_idx = testcase.step_index if testcase.step_index is not None else 0
    if step_service_codes and step_idx in step_service_codes:
        return step_service_codes[step_idx]
    return extract_service_code_from_testcase_name(testcase.name)


def step_service_codes_from_steps(steps_json: str | None) -> dict[int, str]:
    """Map logical step index (0-based) → service_code from scenario steps."""
    from app.utils.json_text import loads_json
    from app.utils.scenario_steps_document import parse_steps_list

    raw = parse_steps_list(loads_json(steps_json, []))
    out: dict[int, str] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        num = item.get("number")
        if not isinstance(num, int) or num < 1:
            continue
        code = item.get("service_code")
        if isinstance(code, str) and code.strip():
            out[num - 1] = code.strip()
            continue
        action = str(item.get("action") or "").strip()
        m = _SERVICE_CODE_RE.search(action)
        if m:
            out[num - 1] = m.group(1)
    return out

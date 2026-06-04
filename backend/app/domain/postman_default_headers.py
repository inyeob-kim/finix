"""Default Postman request headers for FCC-style API collections."""

from __future__ import annotations

from datetime import date

from app.domain.postman_collection_config import PostmanHeaderSpec

_FCC_HEADER_TEMPLATE: tuple[tuple[str, str], ...] = (
    ("Content-Type", "application/json"),
    ("instCd", "1001"),
    ("deptId", "10001"),
    ("txDt", ""),
    ("staffId", "1000013"),
    ("aprvlId", ""),
    ("srvcCd", ""),
    ("scrnId", ""),
)


def fcc_tx_date_today() -> str:
    """Channel date header (YYYYMMDD, server local date)."""
    return date.today().strftime("%Y%m%d")


def default_postman_header_specs() -> list[PostmanHeaderSpec]:
    """Return a fresh copy of the platform default headers."""
    today = fcc_tx_date_today()
    rows: list[PostmanHeaderSpec] = []
    for key, value in _FCC_HEADER_TEMPLATE:
        rows.append(
            PostmanHeaderSpec(key=key, value=today if key == "txDt" else value),
        )
    return rows


def refresh_tx_dt_header_value(
    config_headers: list[PostmanHeaderSpec],
) -> list[PostmanHeaderSpec]:
    """Ensure txDt reflects today's date before export."""
    today = fcc_tx_date_today()
    out: list[PostmanHeaderSpec] = []
    for row in config_headers:
        if row.key.strip().lower() == "txdt":
            out.append(row.model_copy(update={"value": today}))
        else:
            out.append(row.model_copy(deep=True))
    return out


def build_postman_request_headers(
    config_headers: list[PostmanHeaderSpec] | None = None,
) -> list[dict[str, str]]:
    """Build Postman Collection v2.1 ``request.header`` entries."""
    rows = config_headers if config_headers else default_postman_header_specs()
    rows = refresh_tx_dt_header_value(rows)
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in rows:
        key = row.key.strip()
        if not key:
            continue
        lower = key.lower()
        if lower in seen:
            continue
        seen.add(lower)
        out.append({"key": key, "value": row.value})
    return out

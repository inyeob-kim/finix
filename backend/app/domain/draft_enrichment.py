"""Optional Step-1 draft enrichment from Swagger / Data Pool (graceful skip)."""

from __future__ import annotations

from typing import Any

from app.core.logger import get_logger

logger = get_logger(__name__)


async def build_draft_enrichment_hints(
    *,
    service_code: str,
    use_swagger: bool,
    use_data_pool: bool,
    openapi_service: Any | None = None,
    pool_service: Any | None = None,
) -> str | None:
    """
    Build optional hint text for the YAML-from-source user prompt.

    When a toggle is on but data is missing, skip quietly (Graceful Skip).
    Does not invent business rules — only schema/sample hints for input macros.
    """
    code = (service_code or "").strip()
    blocks: list[str] = []

    if use_swagger:
        if openapi_service is None:
            logger.info(
                "use_swagger=true but OpenAPI service unavailable; skip",
                extra={"service_code": code},
            )
        else:
            try:
                ops = await openapi_service.list_operations(
                    service_code=code or None,
                    limit=15,
                    offset=0,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Swagger enrichment failed; skip",
                    extra={"service_code": code, "error": str(exc)},
                )
                ops = []
            if not ops:
                logger.info(
                    "use_swagger=true but no operations for service; skip",
                    extra={"service_code": code},
                )
            else:
                lines = [
                    "OPTIONAL SWAGGER HINTS (do not invent E/N beyond source; "
                    "prefer macros for formats when useful):"
                ]
                for op in ops[:10]:
                    method = getattr(op, "method", None) or (
                        op.get("method") if isinstance(op, dict) else ""
                    )
                    path = getattr(op, "path", None) or (
                        op.get("path") if isinstance(op, dict) else ""
                    )
                    summary = getattr(op, "summary", None) or (
                        op.get("summary") if isinstance(op, dict) else ""
                    )
                    lines.append(f"- {method} {path} {summary or ''}".rstrip())
                lines.append(
                    "When a field needs a live value with no literal in source, "
                    "you may use {{pool.field}} or {{$date.today()}} in input."
                )
                blocks.append("\n".join(lines))

    if use_data_pool:
        if pool_service is None:
            logger.info(
                "use_data_pool=true but Pool service unavailable; skip",
                extra={"service_code": code},
            )
        else:
            try:
                data = await pool_service.list_samples(
                    service_code=code or None,
                    path_kind="happy",
                    limit=3,
                    offset=0,
                )
                items = data.get("items") if isinstance(data, dict) else []
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Data Pool enrichment failed; skip",
                    extra={"service_code": code, "error": str(exc)},
                )
                items = []
            if not items:
                logger.info(
                    "use_data_pool=true but no happy samples; skip",
                    extra={"service_code": code},
                )
            else:
                sample = items[0]
                req = (
                    sample.get("request_body")
                    if isinstance(sample, dict)
                    else None
                )
                keys: list[str] = []
                if isinstance(req, dict):
                    keys = [str(k) for k in list(req.keys())[:20]]
                lines = [
                    "OPTIONAL DATA POOL HINTS (map real fields via {{pool.field}} "
                    "when source has no fixed literal; do not invent error codes):",
                    f"- sample_id={sample.get('id') if isinstance(sample, dict) else '?'}",
                    f"- endpoint={sample.get('endpoint') if isinstance(sample, dict) else ''}",
                ]
                if keys:
                    lines.append(f"- request fields: {', '.join(keys)}")
                    lines.append(
                        "Example: staffId: \"{{pool.staffId}}\" when the happy sample has staffId."
                    )
                blocks.append("\n".join(lines))

    if not blocks:
        return None
    return "\n\n".join(blocks)

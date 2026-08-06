"""Institution scope for multi-tenant rule / testcase data."""

from __future__ import annotations

from app.core.exceptions import InvalidInputError

# Migration / backfill only — never use as an API default.
DEFAULT_INST_CD = "1001"


def require_inst_cd(inst_cd: str | None) -> str:
    """
    Require a non-empty institution code from API / callers.

    Raises:
        InvalidInputError: when blank or missing.
    """
    code = (inst_cd or "").strip()
    if not code:
        raise InvalidInputError("inst_cd(기관코드)가 필요합니다.")
    return code

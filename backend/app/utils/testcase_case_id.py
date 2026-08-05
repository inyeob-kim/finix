"""Parse YAML case_id from materialized testcase display names."""

from __future__ import annotations

import re

_NEW_PREFIX = re.compile(r"^\[(E|N)\]\s+(\S+)")
_INSTRUCTION_SUFFIX = re.compile(r"\s+\([^)]+\)$")


def strip_instruction_suffix(name: str) -> str:
    return _INSTRUCTION_SUFFIX.sub("", (name or "").strip()).strip()


def parse_case_id_from_testcase_name(
    name: str,
    *,
    service_code: str | None = None,
) -> str | None:
    """
    Extract case_id from a materialized name.

    Supports ``[N] PY027-N-001 · …`` and legacy ``PY027 PY027-N-001 …``.
    """
    base = strip_instruction_suffix(name)
    if not base:
        return None
    new_match = _NEW_PREFIX.match(base)
    if new_match:
        return new_match.group(2).strip() or None

    code = (service_code or "").strip()
    if code:
        prefix = f"{code} "
        if base.startswith(prefix):
            rest = base[len(prefix) :].strip()
            if not rest:
                return None
            first_space = rest.find(" ")
            return rest if first_space < 0 else rest[:first_space]
    return None

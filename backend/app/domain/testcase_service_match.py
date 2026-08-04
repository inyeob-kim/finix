"""Match materialized test-case display names to a CBS service code."""

from __future__ import annotations


def name_matches_service_code(name: str, service_code: str) -> bool:
    """
    True when a testcase ``name`` belongs to ``service_code``.

    Supports:
    - Legacy: ``PY016 …``
    - Current: ``[E] PY016-E-001 · …`` / ``[N] PY016-N-001 · …``
    """
    code = (service_code or "").strip()
    text = (name or "").strip()
    if not code or not text:
        return False
    if text.startswith(f"{code} "):
        return True
    # ``[E] PY016-E-001 · title`` / ``[N] PY016-N-001 · title``
    marker = f"] {code}-"
    return marker in text

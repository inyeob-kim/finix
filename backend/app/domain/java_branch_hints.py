"""Detect observable business branches in Java service source for YAML AI hints."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.domain.java_service_scope import scope_java_source_to_service


@dataclass(slots=True, frozen=True)
class BranchHint:
    """One required-or-recommended YAML case hint derived from source text."""

    kind: str
    summary: str
    evidence: str


_PRIVATE_METHOD_CALL_RE = re.compile(r"(?<![\w.])(_[A-Za-z][A-Za-z0-9_]*)\s*\(")
_PRIVATE_METHOD_DEF_RE = re.compile(
    r"(?:private|protected)\s+[^{\n]+?\b(_[A-Za-z][A-Za-z0-9_]*)\s*\([^;]*\)\s*(?:throws[^{]*)?\{",
    re.MULTILINE,
)

# Domain-agnostic branch kinds (deposit/loan/common/UI — any CBS service).
# Summaries describe *observable business outcome differences*, not line-by-line ifs.
_HINT_PATTERNS: tuple[tuple[str, str, re.Pattern[str]], ...] = (
    (
        "PARAM_CHECK",
        "E: required input rejected via check*Parm / mandatory param utility "
        "(error_code may be null if literal is only inside the utility)",
        re.compile(r"check\w*Parm\s*\(|checkMandatory\s*\(", re.I),
    ),
    (
        "NULL_TO_EMPTY",
        "N: null lookup/list returns empty Out/list (not throw) — keep distinct from throw paths",
        re.compile(
            r"==\s*null[\s\S]{0,120}return\s+new\s+\w+",
            re.I,
        ),
    ),
    (
        "NULL_TO_THROW",
        "E: null lookup/list throws BizApplicationException with a code literal in this source",
        re.compile(
            r"==\s*null[\s\S]{0,160}throw\s+new\s+BizApplicationException\s*\(\s*\"[^\"]+\"",
            re.I,
        ),
    ),
    (
        "ACTOR_SWITCH",
        "N: actor/login-type (or channel) switch changes authorization or returned business data",
        re.compile(
            r"switch\s*\(\s*LoginTypeEnum|LoginTypeEnum\s+\w+\s*=|"
            r"TxTpDscdEnum|chnlDscd|ChannelDscd",
            re.I,
        ),
    ),
    (
        "AUTHZ_BYPASS",
        "N: privileged/master/admin path bypasses normal authorization checks",
        re.compile(
            r"hasMaster|RoleAthrtyAplyRngEnum\.MASTER|MASTER\.getValue|"
            r"isAdmin|adminYn|SUPER_USER",
            re.I,
        ),
    ),
    (
        "INST_FEATURE_FLAG",
        "N: institution parameter / feature flag changes filtering or processing outcome",
        re.compile(
            r"getInstParm\s*\(|InstParamEnum\.|\w+AplyYn|"
            r"MENU_CONTROL_HIDING|FeatureFlag|ParmProvider",
            re.I,
        ),
    ),
    (
        "AUTH_FILTER",
        "N: role/authority relation filters what the caller may see or execute",
        re.compile(
            r"isValidRoleScreenRelation|_validStaffRole|_validCustomerRelatedPersonRole|"
            r"_checkScreenRelation|_validVisibleMenu|hasAuthority|checkRole|"
            r"RoleValidator|getListStaffRole",
            re.I,
        ),
    ),
    (
        "STATUS_GUARD",
        "E or N: status/state guard changes allow vs reject (account/arrangement/tx status)",
        re.compile(
            r"StsCd|StatusCd|getSts\w*\(|StsCmEnum|equalsIgnoreCase\([^\)]*STS|"
            r"CLOSED|CANCEL|ACTIVE\.getValue",
            re.I,
        ),
    ),
    (
        "AMOUNT_LIMIT",
        "E or N: amount/limit/balance rule changes accept vs reject",
        re.compile(
            r"compareTo\s*\(|BigDecimal|LmtAmt|limitAmt|balAmt|exceed|dailyLmt|"
            r"getAmt\s*\(",
            re.I,
        ),
    ),
)


def format_branch_hints_for_prompt(hints: list[BranchHint]) -> str:
    """Render mandatory branch checklist for the LLM user prompt."""
    if not hints:
        return ""
    lines = [
        "DETECTED BRANCHES IN SCOPE (deterministic, domain-agnostic scan for any CBS service). "
        "Each item is an *observable business outcome difference* — not every source if. "
        "Map each to at least one YAML case. Do NOT collapse them into one generic success N. "
        "Do NOT add cases whose only purpose is line coverage (pure DTO mapping, tree wiring, "
        "or setter loops without a different user/business result):",
    ]
    for i, hint in enumerate(hints, start=1):
        lines.append(f"{i}. [{hint.kind}] {hint.summary}")
        lines.append(f"   evidence: {hint.evidence}")
    lines.append(
        "Vary inputs and/or described preconditions (actor, privilege, institution flag, status) "
        "so cases are distinguishable. For PARAM_CHECK use error_code null if no code literal."
    )
    return "\n".join(lines)


def _method_body_after(source: str, brace_index: int) -> str | None:
    if brace_index < 0 or brace_index >= len(source):
        return None
    depth = 0
    i = brace_index
    in_str: str | None = None
    escaped = False
    while i < len(source):
        ch = source[i]
        if in_str:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in ('"', "'"):
            in_str = ch
            i += 1
            continue
        if ch == "/" and i + 1 < len(source):
            nxt = source[i + 1]
            if nxt == "/":
                nl = source.find("\n", i)
                i = len(source) if nl < 0 else nl + 1
                continue
            if nxt == "*":
                end = source.find("*/", i + 2)
                i = len(source) if end < 0 else end + 2
                continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return source[brace_index : i + 1]
        i += 1
    return None


def _collect_private_helpers(source: str, entry_body: str, *, max_helpers: int = 8) -> str:
    """Append bodies of same-class private helpers called from entry (shallow)."""
    names = []
    seen: set[str] = set()
    for match in _PRIVATE_METHOD_CALL_RE.finditer(entry_body):
        name = match.group(1)
        if name in seen:
            continue
        # Skip common DI getters that only return beans
        if name.startswith("_get") and "MenuMgmt" not in name and len(name) < 20:
            # still allow _getMenuMgmtSvcGetUserMenuListOut which is longer business helper
            if name in {
                "_getMenu",
                "_getTrnsfrLng",
                "_getStaffMngr",
                "_getRole",
                "_getCustRprsnMngr",
                "_getRoleValidator",
                "_getInstParmProvider",
                "_getCmnContext",
            }:
                continue
        seen.add(name)
        names.append(name)
        if len(names) >= max_helpers:
            break

    chunks = [entry_body]
    for name in names:
        def_re = re.compile(
            rf"(?:private|protected)\s+[^{{\n]+?\b{re.escape(name)}\s*\([^;]*\)\s*(?:throws[^{{]*)?\{{",
            re.MULTILINE,
        )
        m = def_re.search(source)
        if not m:
            continue
        body = _method_body_after(source, m.end() - 1)
        if body:
            chunks.append(f"\n// helper {name}\n{body}")
    return "\n".join(chunks)


def collect_analysis_text(java_source: str, service_code: str) -> str:
    """Entry method (+ key private helpers) text used for branch detection."""
    raw = (java_source or "").replace("\r\n", "\n")
    scoped = scope_java_source_to_service(raw, service_code)
    entry = scoped.scoped_source if not scoped.used_fallback else raw
    return _collect_private_helpers(raw, entry)


def detect_branch_hints(java_source: str, service_code: str) -> list[BranchHint]:
    """Return distinct branch hints for the selected service path."""
    text = collect_analysis_text(java_source, service_code)
    hints: list[BranchHint] = []
    seen_kinds: set[str] = set()
    for kind, summary, pattern in _HINT_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        if kind in seen_kinds:
            continue
        seen_kinds.add(kind)
        snippet = match.group(0).replace("\n", " ")
        if len(snippet) > 100:
            snippet = snippet[:100]
        hints.append(BranchHint(kind=kind, summary=summary, evidence=snippet))
    return hints

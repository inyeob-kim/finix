"""Scope multi-service Java classes to one @CbbSrvcInfo method."""

from __future__ import annotations

import re
from dataclasses import dataclass


_SRVC_INFO_RE = re.compile(
    r"@CbbSrvcInfo\s*\(\s*srvcCd\s*=\s*[\"'](?P<code>[A-Za-z0-9_-]+)[\"']",
    re.MULTILINE,
)


@dataclass(slots=True, frozen=True)
class ScopedJavaServiceSource:
    """Result of narrowing pasted source to one service entry method."""

    service_code: str
    scoped_source: str
    method_name: str | None
    other_service_codes: tuple[str, ...]
    used_fallback: bool


def list_cbb_service_codes(java_source: str) -> list[str]:
    """Return unique @CbbSrvcInfo srvcCd values in declaration order."""
    seen: set[str] = set()
    ordered: list[str] = []
    for match in _SRVC_INFO_RE.finditer(java_source or ""):
        code = match.group("code").strip()
        if code and code not in seen:
            seen.add(code)
            ordered.append(code)
    return ordered


def scope_java_source_to_service(java_source: str, service_code: str) -> ScopedJavaServiceSource:
    """
    Prefer the method annotated with ``@CbbSrvcInfo(srvcCd="<service_code>")``.

    If that annotation is missing, return the original source (used_fallback=True)
    so the LLM path still runs with prompt-only scoping.
    """
    code = (service_code or "").strip()
    raw = (java_source or "").replace("\r\n", "\n")
    others = tuple(c for c in list_cbb_service_codes(raw) if c != code)
    if not code or not raw.strip():
        return ScopedJavaServiceSource(
            service_code=code,
            scoped_source=raw,
            method_name=None,
            other_service_codes=others,
            used_fallback=True,
        )

    match = _find_target_srvc_match(raw, code)
    if match is None:
        return ScopedJavaServiceSource(
            service_code=code,
            scoped_source=raw,
            method_name=None,
            other_service_codes=others,
            used_fallback=True,
        )

    method_start = _method_block_start(raw, match.start())
    method_end = _method_block_end(raw, match.end())
    if method_start is None or method_end is None:
        return ScopedJavaServiceSource(
            service_code=code,
            scoped_source=raw,
            method_name=None,
            other_service_codes=others,
            used_fallback=True,
        )

    chunk = raw[method_start:method_end].strip()
    method_name = _method_name_near(raw, match.end())
    package_line = _first_package_line(raw)
    class_line = _enclosing_class_signature(raw, method_start)
    header_bits = [b for b in (package_line, class_line) if b]
    header = "\n".join(header_bits)
    note = (
        f"// SCOPED to service_code={code} "
        f"(ignore other @CbbSrvcInfo methods in the original class)"
    )
    if others:
        note += f" // also present in file: {', '.join(others)}"
    scoped = "\n\n".join(part for part in (header, note, chunk) if part).strip() + "\n"
    return ScopedJavaServiceSource(
        service_code=code,
        scoped_source=scoped,
        method_name=method_name,
        other_service_codes=others,
        used_fallback=False,
    )


def _find_target_srvc_match(source: str, service_code: str) -> re.Match[str] | None:
    for match in _SRVC_INFO_RE.finditer(source):
        if match.group("code") == service_code:
            return match
    return None


def _first_package_line(source: str) -> str | None:
    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith("package "):
            return stripped if stripped.endswith(";") else f"{stripped};"
    return None


def _enclosing_class_signature(source: str, method_start: int) -> str | None:
    window = source[:method_start]
    class_re = re.compile(
        r"(?:public\s+)?(?:abstract\s+|final\s+)?class\s+\w+[^{]*\{",
        re.MULTILINE,
    )
    matches = list(class_re.finditer(window))
    if not matches:
        return None
    sig = matches[-1].group(0).rstrip()
    return f"// enclosing: {sig}"


def _method_block_start(source: str, annotation_start: int) -> int | None:
    """Include preceding Javadoc / other annotations belonging to the method."""
    line_start = source.rfind("\n", 0, annotation_start) + 1
    cursor = line_start
    while cursor > 0:
        prev_nl = source.rfind("\n", 0, cursor - 1)
        prev_line_start = prev_nl + 1
        prev = source[prev_line_start:cursor].strip()
        if not prev:
            cursor = prev_line_start
            continue
        if prev.startswith("*") or prev.startswith("/*") or prev.startswith("/**"):
            cursor = prev_line_start
            continue
        if prev.startswith("@"):
            cursor = prev_line_start
            continue
        if prev.startswith("//"):
            cursor = prev_line_start
            continue
        break
    # If Javadoc opened earlier, walk back to /**
    probe = source[:cursor]
    doc = probe.rfind("/**")
    if doc != -1 and doc >= max(0, cursor - 4000):
        between = probe[doc:cursor]
        if "*/" not in between[3:]:
            # incomplete — ignore
            pass
        else:
            # ensure no method/class body between doc and annotations
            after_doc = between[between.find("*/") + 2 :]
            if not re.search(r"\b(class|interface|enum)\b", after_doc):
                return doc
    return cursor


def _method_block_end(source: str, annotation_end: int) -> int | None:
    brace = source.find("{", annotation_end)
    if brace < 0:
        return None
    depth = 0
    i = brace
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
                return i + 1
        i += 1
    return None


def _method_name_near(source: str, annotation_end: int) -> str | None:
    window = source[annotation_end : annotation_end + 800]
    match = re.search(
        r"(?:public|protected|private)\s+[^\(\{]+?\b([A-Za-z_][A-Za-z0-9_]*)\s*\(",
        window,
    )
    return match.group(1) if match else None

"""Ground YAML rule evidence against pasted Java/Kotlin source text."""

from __future__ import annotations

import re
from typing import Any

from app.core.exceptions import InvalidInputError

_WS_RE = re.compile(r"\s+")
_ELLIPSIS_RE = re.compile(r"\.{3}|…")
_LINE_COMMENT_RE = re.compile(r"//.*?$", re.MULTILINE)
_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
# Identifiers + numeric/string literals — "content" of a Java snippet.
_TOKEN_RE = re.compile(
    r"[A-Za-z_][A-Za-z0-9_]*"
    r"|[0-9]+(?:\.[0-9]+)?"
    r"|\"(?:\\.|[^\"])*\""
    r"|'(?:\\.|[^'])*'"
)
_NOISE_TOKENS = frozenset(
    {
        "if",
        "else",
        "for",
        "while",
        "return",
        "new",
        "throw",
        "throws",
        "public",
        "private",
        "protected",
        "static",
        "final",
        "void",
        "class",
        "this",
        "null",
        "true",
        "false",
    }
)
_MIN_CONTENT_TOKENS = 3
# True rejection only — soft early returns are NOT Error cases.
_E_REJECTION_EVIDENCE_RE = re.compile(
    r"\bthrow\b|"
    r"check\w*Parm\s*\(|"
    r"check\w*Param(?:eter)?s?\s*\(|"
    r"checkMandatory\s*\(|"
    r"requireNonEmpty\s*\(|"
    r"requireNonNull\s*\(|"
    r"BizApplicationException|"
    r"ApplicationException",
    re.IGNORECASE,
)


def snippet_shows_rejection(snippet: str) -> bool:
    """True when evidence cites throw / check*Parm / business exception — not return null."""
    return bool(_E_REJECTION_EVIDENCE_RE.search(snippet or ""))


def strip_java_comments(text: str) -> str:
    """Remove // and /* */ comments so evidence can span lines around comments."""
    without_block = _BLOCK_COMMENT_RE.sub(" ", text or "")
    return _LINE_COMMENT_RE.sub(" ", without_block)


def normalize_source_for_match(text: str) -> str:
    """Strip comments and collapse whitespace for substring checks."""
    cleaned = strip_java_comments(text or "").replace("\r\n", "\n")
    return _WS_RE.sub("", cleaned)


def extract_content_tokens(text: str) -> list[str]:
    """
    Extract semantic tokens (identifiers / literals).

    Whitespace, braces, and punctuation do not matter — only content tokens.
    """
    cleaned = strip_java_comments(text or "")
    return _TOKEN_RE.findall(cleaned)


def content_tokens_for_match(text: str) -> list[str]:
    """Drop only ultra-generic keywords; keep domain identifiers."""
    return [t for t in extract_content_tokens(text) if t not in _NOISE_TOKENS]


def is_subsequence(needle: list[str], haystack: list[str]) -> bool:
    """True when all needle tokens appear in order inside haystack (gaps allowed)."""
    if not needle:
        return False

    def soft_eq(expected: str, actual: str) -> bool:
        if expected == actual:
            return True
        # Truncated method/field cite: setAmt vs setAmtValue
        return len(expected) >= 4 and actual.startswith(expected)

    i = 0
    for token in haystack:
        if soft_eq(needle[i], token):
            i += 1
            if i >= len(needle):
                return True
    return False


def snippet_segments(snippet: str) -> list[str]:
    """Split evidence snippets on ellipsis; keep non-empty fragments."""
    raw = (snippet or "").strip()
    if not raw:
        return []
    parts = _ELLIPSIS_RE.split(raw)
    return [p.strip() for p in parts if p.strip()]


def snippet_matches_source(snippet: str, source_text: str) -> bool:
    """
    Ground snippet by content, not character-perfect layout.

    Passes when:
    1) whitespace/comment-normalized contiguous match, or
    2) content-token subsequence appears in the source (gaps for other code/comments OK).
    """
    norm_src = normalize_source_for_match(source_text)
    src_tokens = extract_content_tokens(source_text)
    segments = snippet_segments(snippet)
    if not segments:
        return False

    for segment in segments:
        norm_seg = normalize_source_for_match(segment)
        if len(norm_seg) >= 12 and norm_seg in norm_src:
            continue

        content = content_tokens_for_match(segment)
        if len(content) < _MIN_CONTENT_TOKENS:
            # Very short cite: require contiguous normalized match
            if len(norm_seg) >= 8 and norm_seg in norm_src:
                continue
            return False
        if not is_subsequence(content, src_tokens):
            return False
    return True


def validate_rules_grounded_in_source(
    payload: dict[str, Any],
    source_text: str,
) -> None:
    """
    Reject invented E codes and evidence that cannot be found in the pasted source.

    Snippet checks compare semantic content (identifiers/literals in order), not
    exact whitespace or brace layout.
    """
    src = (source_text or "").strip()
    if len(src) < 16:
        raise InvalidInputError("소스 근거 검증을 위한 source_text가 너무 짧습니다.")

    rules = payload.get("rules") or []
    if not isinstance(rules, list):
        return

    for idx, rule in enumerate(rules):
        if not isinstance(rule, dict):
            continue
        rtype = str(rule.get("rule_type") or "").strip()
        expect = rule.get("expect") if isinstance(rule.get("expect"), dict) else {}

        if rtype == "E":
            raw_code = expect.get("error_code")
            # Treat YAML null and nullish strings ("null", "none", …) as absent.
            if raw_code is None:
                error_code = ""
            else:
                error_code = str(raw_code).strip()
                if error_code.lower() in {"", "null", "none", "n/a", "na", "-", "~", "nil"}:
                    error_code = ""
            if error_code:
                if (
                    error_code not in src
                    and normalize_source_for_match(error_code)
                    not in normalize_source_for_match(src)
                ):
                    raise InvalidInputError(
                        f"rules[{idx}].expect.error_code '{error_code}'가 붙여넣은 소스에 "
                        "없습니다. 소스에 없는 에러코드/검증을 만들어내지 마세요. "
                        "throw가 없으면 Error(E) 케이스를 넣지 마세요. "
                        "check*Parm 유틸 검증은 error_code: null 을 사용하세요."
                    )

            evidence = rule.get("source_evidence")
            e_snippet = ""
            if isinstance(evidence, dict):
                e_snippet = str(evidence.get("snippet") or "").strip()
            if not snippet_shows_rejection(e_snippet):
                preview = " ".join(e_snippet.split())[:80] if e_snippet else "(empty)"
                raise InvalidInputError(
                    f"rules[{idx}]: rule_type=E 인데 거절 증거가 없습니다. "
                    "throw / BizApplicationException / check*Parm 등 실제 거절만 E로 두세요. "
                    "return null·early return·default 세팅(isEmpty→set)은 E가 아닙니다 "
                    "(해당 분기는 N으로 두거나 케이스를 삭제하세요). "
                    f"문제 snippet: {preview}"
                )

        evidence = rule.get("source_evidence")
        if not isinstance(evidence, dict):
            continue
        snippet = str(evidence.get("snippet") or "").strip()
        if not snippet:
            continue
        if snippet_matches_source(snippet, src):
            continue
        preview = " ".join(snippet.split())[:80]
        raise InvalidInputError(
            f"rules[{idx}].source_evidence.snippet이 붙여넣은 소스에 없습니다. "
            "식별자/호출 내용이 소스와 맞아야 합니다 (공백·줄바꿈·중괄호 배치는 무시). "
            f"문제 조각: {preview}"
        )

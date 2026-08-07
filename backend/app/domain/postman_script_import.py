"""Extract Postman script set() vars and map them via AI + catalog RAG.

Literal string assignments are applied as-is. All dynamic RHS values are
classified by the LLM using similarity-retrieved catalog candidates.
Template composites are rewritten after parts are mapped. Extract/context
tokens never auto-bake into request bodies.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Literal

from app.domain.collection_var_generators import (
    build_generator_description,
    default_business_label,
    generator_returns_hint,
    is_valid_generator_key,
    normalize_generator_naming,
    validate_custom_impl,
)
from app.domain.finix_macro_grammar import (
    finix_context_token,
    finix_token_for_builtin_id,
    looks_like_finix_macro,
    parse_macro,
)
from app.domain.postman_collection_parse import event_script_text

logger = logging.getLogger(__name__)

ScriptVarKind = Literal["literal", "date", "generator", "extract", "unknown"]
ScriptApplyMode = Literal["auto", "propose_only", "needs_review", "skip"]

_SET_CALL_RE = re.compile(
    r"""pm\.(?:environment|variables|collectionVariables)\.set\s*\(\s*"""
    r"""(?:['"]([^'"]+)['"]|`([^`]+)`)\s*,\s*""",
    re.IGNORECASE,
)

_BINDING_START_RE = re.compile(
    r"""(?:^|[;\n])\s*(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*""",
    re.MULTILINE,
)

_STRING_LITERAL_RE = re.compile(r"""^\s*(['"])(.*)\1\s*$""", re.DOTALL)
_SIMPLE_IDENT_RE = re.compile(r"^[A-Za-z_][\w]*$")
_TEMPLATE_VAR_RE = re.compile(r"\$\{([A-Za-z_][\w]*)\}")
_ARRAY_FROM_LEN_RE = re.compile(
    r"""array\.from\s*\(\s*\{\s*length\s*:\s*(\d+)""",
    re.IGNORECASE,
)
_PICK_CALL_RE = re.compile(
    r"""(?:pickRandom|pick)\s*\(\s*([A-Za-z_][\w]*)\s*\)""",
    re.IGNORECASE,
)
_STRING_LIST_RE = re.compile(
    r"""\[\s*((?:['"][^'"]*['"]\s*,?\s*)+)\]""",
    re.DOTALL,
)
_BIRTH_AGE_RE = re.compile(
    r"(?:getutcyear|getfullyear)\s*\(\s*\)\s*-\s*(\d+)",
    re.IGNORECASE,
)
_UUID_TIP_RE = re.compile(
    r"uuid|guid|crypto\.randomuuid|uuidv4|uuid\.v4",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class ScriptVarIntent:
    """One variable assignment inferred from Postman scripts."""

    name: str
    source: str
    kind: ScriptVarKind
    evidence: str
    finix_token: str | None = None
    apply: ScriptApplyMode = "needs_review"
    rhs: str = ""
    catalog_proposal: dict[str, Any] | None = None
    # Sibling const/let snippets for AI (ages, list defs).
    related_bindings: dict[str, str] | None = None


@dataclass(slots=True)
class ScriptImportPlan:
    """Script analysis result used before Env/Collection substitution."""

    intents: list[ScriptVarIntent] = field(default_factory=list)
    auto_overrides: dict[str, str] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)
    catalog_proposals: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "intents": [
                {
                    "name": i.name,
                    "source": i.source,
                    "kind": i.kind,
                    "evidence": i.evidence,
                    "finix_token": i.finix_token,
                    "apply": i.apply,
                    "catalog_proposal": i.catalog_proposal,
                }
                for i in self.intents
            ],
            "auto_overrides": dict(self.auto_overrides),
            "notes": list(self.notes),
            "catalog_proposals": list(self.catalog_proposals),
        }


def _balanced_arg_end(text: str, start: int) -> int:
    depth = 0
    i = start
    n = len(text)
    in_str: str | None = None
    escape = False
    while i < n:
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in "'\"`":
            in_str = ch
            i += 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            if depth == 0:
                return i
            depth -= 1
        elif ch == "," and depth == 0:
            return i
        i += 1
    return n


def _binding_expr_end(text: str, start: int) -> int:
    depth_paren = 0
    depth_brace = 0
    depth_bracket = 0
    i = start
    n = len(text)
    in_str: str | None = None
    escape = False
    while i < n:
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in "'\"`":
            in_str = ch
            i += 1
            continue
        if ch == "(":
            depth_paren += 1
        elif ch == ")":
            depth_paren = max(0, depth_paren - 1)
        elif ch == "{":
            depth_brace += 1
        elif ch == "}":
            depth_brace = max(0, depth_brace - 1)
        elif ch == "[":
            depth_bracket += 1
        elif ch == "]":
            depth_bracket = max(0, depth_bracket - 1)
        elif (
            ch == ";"
            and depth_paren == 0
            and depth_brace == 0
            and depth_bracket == 0
        ):
            return i
        i += 1
    return n


def extract_js_bindings(script: str) -> dict[str, str]:
    """Map ``const|let|var name = expr`` bindings (last write wins)."""
    text = script or ""
    out: dict[str, str] = {}
    for match in _BINDING_START_RE.finditer(text):
        name = match.group(1)
        start = match.end()
        end = _binding_expr_end(text, start)
        expr = text[start:end].strip().rstrip(";").strip()
        if name and expr:
            out[name] = expr
    return out


def resolve_expr(
    expr: str,
    bindings: dict[str, str],
    *,
    depth: int = 0,
) -> str:
    """Follow simple identifier aliases through *bindings*."""
    e = (expr or "").strip()
    if depth > 8 or not e:
        return e
    if _SIMPLE_IDENT_RE.fullmatch(e) and e in bindings:
        return resolve_expr(bindings[e], bindings, depth=depth + 1)
    return e


def extract_set_assignments(script: str) -> list[tuple[str, str]]:
    """Return ``(var_name, rhs_expression)`` pairs from pm.*.set calls."""
    text = script or ""
    out: list[tuple[str, str]] = []
    for match in _SET_CALL_RE.finditer(text):
        name = (match.group(1) or match.group(2) or "").strip()
        if not name:
            continue
        rhs_start = match.end()
        rhs_end = _balanced_arg_end(text, rhs_start)
        rhs = text[rhs_start:rhs_end].strip()
        out.append((name, rhs))
    return out


def finix_catalog_token(key: str) -> str | None:
    """Build ``{{$generator.KEY()}}`` when *key* is a valid catalog id."""
    k = (key or "").strip().lower()
    if not is_valid_generator_key(k):
        return None
    token = f"{{{{$generator.{k}()}}}}"
    return token if parse_macro(token) is not None else None


def _normalize_finix_token(token: str | None) -> str | None:
    raw = (token or "").strip()
    if not raw:
        return None
    if parse_macro(raw) is not None:
        return raw
    # Composite values like "{{$generator.a()}}{{$generator.b()}}@x.com"
    if looks_like_finix_macro(raw) and "{{$" in raw:
        return raw
    return None


def _is_context_token(token: str | None) -> bool:
    raw = (token or "").strip()
    return bool(raw) and "context." in raw


def _related_bindings_for_ai(
    rhs: str,
    bindings: dict[str, str],
) -> dict[str, str]:
    """Collect sibling bindings that help AI understand the assignment."""
    if not bindings:
        return {}
    out: dict[str, str] = {}
    for name in re.findall(r"\b([A-Za-z_][\w]*)\b", rhs or ""):
        val = bindings.get(name)
        if val and name not in out:
            out[name] = val[:240]
    # Prefer list literals and date-range consts even if not referenced by name.
    for key, val in bindings.items():
        if key in out:
            continue
        low = (val or "").lower()
        if (
            (val or "").strip().startswith("[")
            or any(
                tip in low
                for tip in (
                    "earliest",
                    "latest",
                    "onedayinmilliseconds",
                    "availablebirth",
                    "getutcyear",
                    "getfullyear",
                    "pickrandom",
                )
            )
        ):
            out[key] = val[:240]
        if len(out) >= 16:
            break
    return out


def _rewrite_simple_template(
    expr: str,
    var_tokens: dict[str, str],
) -> str | None:
    """
    Rewrite `` `${a}${b}@x` `` into Finix macros when every ${var} is known.

    Rejects property access like ``${name.charAt(0)}``.
    """
    raw = (expr or "").strip()
    if raw.startswith("`") and raw.endswith("`") and len(raw) >= 2:
        raw = raw[1:-1]
    if "${" not in raw:
        return None
    if re.search(r"\$\{[^}]*[^A-Za-z0-9_}][^}]*\}", raw):
        return None

    missing: list[str] = []

    def repl(match: re.Match[str]) -> str:
        name = match.group(1)
        token = var_tokens.get(name)
        if not token:
            missing.append(name)
            return match.group(0)
        return token

    out = _TEMPLATE_VAR_RE.sub(repl, raw)
    if missing or "${" in out:
        return None
    return out


def _apply_template_rewrites(
    intents: list[ScriptVarIntent],
) -> list[ScriptVarIntent]:
    """Second pass: composites whose parts already mapped → auto Finix tokens."""
    tokens = {
        i.name: i.finix_token
        for i in intents
        if i.apply == "auto"
        and i.finix_token
        and looks_like_finix_macro(i.finix_token)
    }
    if not tokens:
        return intents
    out: list[ScriptVarIntent] = []
    for intent in intents:
        if intent.apply != "needs_review" or intent.kind not in {
            "unknown",
            "date",
        }:
            out.append(intent)
            continue
        rewritten = _rewrite_simple_template(intent.rhs or intent.evidence, tokens)
        if not rewritten:
            out.append(intent)
            continue
        out.append(
            ScriptVarIntent(
                name=intent.name,
                source=intent.source,
                kind="generator",
                evidence=intent.evidence,
                finix_token=rewritten,
                apply="auto",
                rhs=intent.rhs,
                catalog_proposal=None,
                related_bindings=intent.related_bindings,
            )
        )
    return out



def extract_script_assignments(collection: Any) -> list[ScriptVarIntent]:
    """Extract pm.*.set assignments; only string literals are auto without AI.

    All other vars stay needs_review for RAG + AI classify/create.
    """
    scripts = collect_collection_scripts(collection)
    logger.debug(
        "postman_script_import collect scripts=%s sources=%s",
        len(scripts),
        [s[0] for s in scripts[:20]],
    )
    by_name: dict[str, ScriptVarIntent] = {}
    set_count = 0
    for source, script in scripts:
        bindings = extract_js_bindings(script)
        for var_name, rhs in extract_set_assignments(script):
            set_count += 1
            resolved = resolve_expr(rhs, bindings)
            evidence_rhs = resolved
            if resolved != rhs.strip():
                evidence_rhs = f"{rhs.strip()} → {resolved[:180]}"
            lit = _STRING_LITERAL_RE.match(resolved.strip())
            if lit:
                intent = ScriptVarIntent(
                    name=var_name,
                    source=source,
                    kind="literal",
                    evidence=evidence_rhs[:220],
                    finix_token=None,
                    apply="auto",
                    rhs=lit.group(2),
                )
            else:
                related = _related_bindings_for_ai(resolved, bindings) or None
                intent = ScriptVarIntent(
                    name=var_name,
                    source=source,
                    kind="unknown",
                    evidence=evidence_rhs[:220],
                    finix_token=None,
                    apply="needs_review",
                    rhs=resolved,
                    related_bindings=related,
                )
            prev = by_name.get(var_name)
            if prev is None:
                by_name[var_name] = intent
                continue
            rank = {"literal": 2, "unknown": 1}
            if rank.get(intent.kind, 0) >= rank.get(prev.kind, 0):
                by_name[var_name] = intent
    logger.debug(
        "postman_script_import set_calls=%s unique_vars=%s",
        set_count,
        len(by_name),
    )
    return list(by_name.values())


def collect_collection_scripts(collection: Any) -> list[tuple[str, str]]:
    """Walk collection/request items and return ``(source_label, script_text)``."""
    if isinstance(collection, list):
        collection = {"item": collection}
    if not isinstance(collection, dict):
        return []

    rows: list[tuple[str, str]] = []

    def add_item(label: str, item: dict[str, Any]) -> None:
        for listen in ("prerequest", "test"):
            text = event_script_text(item, listen, max_len=8000)
            if text:
                rows.append((f"{label}:{listen}", text))

    top_events = collection.get("event")
    if isinstance(top_events, list):
        add_item("collection", {"event": top_events})

    top_request = collection.get("request")
    if isinstance(top_request, dict) and "item" not in collection:
        name = str(collection.get("name") or "request").strip() or "request"
        add_item(name, collection)
        return rows

    def walk(items: list[Any], folder: str) -> None:
        for item in items:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip() or "unnamed"
            nested = item.get("item")
            if isinstance(nested, list):
                next_folder = f"{folder}/{name}" if folder else name
                add_item(next_folder or name, item)
                walk(nested, next_folder)
                continue
            path = f"{folder}/{name}" if folder else name
            add_item(path, item)

    items = collection.get("item")
    if isinstance(items, list):
        walk(items, "")
    return rows


def build_auto_overrides(intents: list[ScriptVarIntent]) -> dict[str, str]:
    """Build ``{{var}}`` map. Context/extract tokens never auto-apply."""
    out: dict[str, str] = {}
    for intent in intents:
        if intent.apply != "auto":
            continue
        if intent.kind == "extract" or _is_context_token(intent.finix_token):
            continue
        if intent.kind == "literal":
            out[intent.name] = intent.rhs
            continue
        token = _normalize_finix_token(intent.finix_token)
        if (
            token
            and looks_like_finix_macro(token)
            and not _is_context_token(token)
        ):
            out[intent.name] = token
    return out


def collect_catalog_proposals(
    intents: list[ScriptVarIntent],
) -> list[dict[str, Any]]:
    """Unique catalog create payloads from auto intents (by key)."""
    by_key: dict[str, dict[str, Any]] = {}
    for intent in intents:
        if intent.apply != "auto" or not intent.catalog_proposal:
            continue
        prop = intent.catalog_proposal
        key = str(prop.get("key") or "").strip().lower()
        if not key:
            continue
        try:
            kind = str(prop.get("impl_kind") or "")
            impl = prop.get("impl") if isinstance(prop.get("impl"), dict) else {}
            validated = validate_custom_impl(kind, impl)
        except ValueError:
            continue
        key, label = normalize_generator_naming(
            key=key,
            label=str(prop.get("label") or ""),
            impl_kind=kind,
            impl=validated,
            alias="",
        )
        by_key[key] = {
            "key": key,
            "label": label[:128],
            "description": str(prop.get("description") or "")[:512],
            "prompt": str(prop.get("prompt") or "")[:2000],
            "impl_kind": kind.strip().lower(),
            "impl": validated,
        }
    return list(by_key.values())


def format_script_import_notes(intents: list[ScriptVarIntent]) -> list[str]:
    """Human-readable notes for import result."""
    auto_n = sum(1 for i in intents if i.apply == "auto")
    propose_n = sum(1 for i in intents if i.apply == "propose_only")
    review_n = sum(1 for i in intents if i.apply == "needs_review")
    notes: list[str] = []
    if not intents:
        return notes
    notes.append(
        f"스크립트 변수 분석 {len(intents)}건 "
        f"(자동 {auto_n} / 제안 {propose_n} / 검토 {review_n})"
    )
    autos = [i for i in intents if i.apply == "auto" and i.finix_token]
    if autos:
        sample = ", ".join(f"{i.name}→{i.finix_token}" for i in autos[:6])
        more = f" 외 {len(autos) - 6}개" if len(autos) > 6 else ""
        notes.append(f"스크립트→Finix 매크로: {sample}{more}")
    catalogs = [i for i in intents if i.apply == "auto" and i.catalog_proposal]
    if catalogs:
        keys = ", ".join(
            str(i.catalog_proposal.get("key"))
            for i in catalogs[:6]
            if i.catalog_proposal
        )
        notes.append(f"공유 생성기 적재 후보: {keys}")
    reviews = [i for i in intents if i.apply == "needs_review"]
    if reviews:
        sample = ", ".join(i.name for i in reviews[:8])
        more = f" 외 {len(reviews) - 8}개" if len(reviews) > 8 else ""
        notes.append(f"스크립트 미매핑(검토): {sample}{more}")
    proposes = [i for i in intents if i.apply == "propose_only"]
    if proposes:
        sample = ", ".join(
            f"{i.name}→{i.finix_token or 'extract'}" for i in proposes[:6]
        )
        notes.append(f"응답추출 제안(미자동적용): {sample}")
    return notes


def _safe_catalog_proposal(row: dict[str, Any]) -> dict[str, Any] | None:
    create = row.get("create")
    if not isinstance(create, dict):
        create = row.get("catalog_proposal")
    if not isinstance(create, dict):
        return None
    kind = str(create.get("impl_kind") or "").strip().lower()
    impl = create.get("impl") if isinstance(create.get("impl"), dict) else {}
    try:
        validated = validate_custom_impl(kind, impl)
    except ValueError:
        return None
    key, label = normalize_generator_naming(
        key=str(create.get("key") or "").strip().lower(),
        label=str(create.get("label") or "").strip(),
        impl_kind=kind,
        impl=validated,
        alias="",
    )
    if not key or not is_valid_generator_key(key):
        return None
    desc = str(create.get("description") or "").strip()
    if not desc or "Returns:" not in desc:
        desc = build_generator_description(
            impl_kind=kind,
            impl=validated,
            purpose=label or default_business_label(kind, validated),
            source="postman_import_ai",
            var_name=str(row.get("name") or ""),
        )
    prompt = str(create.get("prompt") or "").strip()
    if not prompt:
        prompt = (
            f"{label}. {generator_returns_hint(kind, validated)}. "
            f"Aliases may include {row.get('name') or key}."
        )[:2000]
    return {
        "key": key,
        "label": label[:128],
        "description": desc[:512],
        "prompt": prompt[:2000],
        "impl_kind": kind,
        "impl": validated,
    }


def merge_ai_intent_overrides(
    intents: list[ScriptVarIntent],
    ai_rows: list[dict[str, Any]],
) -> list[ScriptVarIntent]:
    """Apply AI rows onto unknown/needs_review; extract never auto-bakes."""
    by_name = {i.name: i for i in intents}
    for row in ai_rows:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or "").strip()
        if not name or name not in by_name:
            continue
        prev = by_name[name]
        if prev.kind not in {"unknown"} and prev.apply != "needs_review":
            continue

        action = str(row.get("action") or "").strip().lower()
        kind_raw = str(row.get("kind") or "unknown").strip().lower()
        if kind_raw not in {"literal", "date", "generator", "extract", "unknown"}:
            kind_raw = "unknown"

        proposal = _safe_catalog_proposal(row)
        token = _normalize_finix_token(
            str(row.get("finix_token") or "").strip() or None
        )
        if proposal and action in {"create_catalog", "reuse_catalog"}:
            # Keep token aligned with normalized capability key (not var names).
            token = finix_catalog_token(str(proposal["key"])) or token
        if proposal and not token:
            token = finix_catalog_token(str(proposal["key"]))
        if action in {"create_catalog", "reuse_catalog"} and proposal and not token:
            token = finix_catalog_token(str(proposal["key"]))

        apply_raw = str(row.get("apply") or "").strip().lower()
        if apply_raw not in {"auto", "propose_only", "needs_review", "skip"}:
            if kind_raw == "extract" or action == "extract":
                apply_raw = "propose_only"
            elif token and kind_raw in {"date", "generator"}:
                apply_raw = "auto"
            elif proposal:
                apply_raw = "auto"
                kind_raw = "generator"
            elif kind_raw == "literal":
                apply_raw = "auto"
            else:
                apply_raw = "needs_review"

        if kind_raw == "extract" or action == "extract" or _is_context_token(token):
            kind_raw = "extract"
            apply_raw = "propose_only"
            if not token:
                token = finix_context_token(name)
            proposal = None

        if kind_raw in {"date", "generator"} and not token and not proposal:
            apply_raw = "needs_review"

        if proposal and apply_raw == "auto":
            kind_raw = "generator"
            if not token:
                token = finix_catalog_token(str(proposal["key"]))

        by_name[name] = ScriptVarIntent(
            name=name,
            source=prev.source,
            kind=kind_raw,  # type: ignore[arg-type]
            evidence=prev.evidence,
            finix_token=token,
            apply=apply_raw,  # type: ignore[arg-type]
            rhs=prev.rhs,
            catalog_proposal=proposal,
            related_bindings=prev.related_bindings,
        )
    return list(by_name.values())


def _extract_string_list(expr: str) -> list[str] | None:
    raw = (expr or "").strip()
    m = _STRING_LIST_RE.search(raw)
    if not m:
        return None
    values = re.findall(r"""['"]([^'"]*)['"]""", m.group(1))
    cleaned = [v.strip() for v in values if v.strip()]
    return cleaned or None


def _ages_from_text(text: str) -> tuple[int, int] | None:
    ages = [int(m.group(1)) for m in _BIRTH_AGE_RE.finditer(text or "")]
    if len(ages) < 2:
        return None
    return min(ages), max(ages)


def _digits_proposal(length: int, *, var_name: str) -> tuple[str, dict[str, Any]]:
    n = max(1, min(32, int(length)))
    key = f"random_digits_{n}" if n != 10 else "random_digits"
    if n == 10:
        token = finix_token_for_builtin_id("random_digits") or "{{$generator.random_digits()}}"
        return token, {
            "key": key,
            "label": "난수 10자리",
            "description": build_generator_description(
                impl_kind="random_digits",
                impl={"length": 10},
                purpose="난수 10자리",
                source="postman_import_rhs",
                var_name=var_name,
            ),
            "impl_kind": "random_digits",
            "impl": {"length": 10},
            "prompt": f"Generate a 10-digit numeric string. Aliases: {var_name}."[:2000],
        }
    impl = {"length": n}
    token = finix_catalog_token(key) or "{{$generator.random_digits()}}"
    label = f"난수 {n}자리"
    return token, {
        "key": key,
        "label": label,
        "description": build_generator_description(
            impl_kind="random_digits",
            impl=impl,
            purpose=label,
            source="postman_import_rhs",
            var_name=var_name,
        ),
        "impl_kind": "random_digits",
        "impl": impl,
        "prompt": f"Generate a {n}-digit numeric string. Aliases: {var_name}."[:2000],
    }


def _list_proposal(
    values: list[str],
    *,
    var_name: str,
) -> tuple[str, dict[str, Any]] | None:
    try:
        impl = validate_custom_impl("pick_from_list", {"values": values})
    except ValueError:
        return None
    key, label = normalize_generator_naming(
        key="",
        label="",
        impl_kind="pick_from_list",
        impl=impl,
        alias="",
    )
    token = finix_catalog_token(key)
    if not token:
        return None
    return token, {
        "key": key,
        "label": label,
        "description": build_generator_description(
            impl_kind="pick_from_list",
            impl=impl,
            purpose=label,
            source="postman_import_rhs",
            var_name=var_name,
        ),
        "impl_kind": "pick_from_list",
        "impl": impl,
        "prompt": f"{label}. Aliases: {var_name}."[:2000],
    }


def _birth_proposal(
    *,
    var_name: str,
    min_age: int,
    max_age: int,
) -> tuple[str, dict[str, Any]]:
    lo = max(0, min(120, int(min_age)))
    hi = max(lo, min(120, int(max_age)))
    impl = validate_custom_impl(
        "random_birthdate_yyyymmdd",
        {"min_age": lo, "max_age": hi},
    )
    key, label = normalize_generator_naming(
        key="birthdate_yyyymmdd",
        label="",
        impl_kind="random_birthdate_yyyymmdd",
        impl=impl,
    )
    token = finix_catalog_token(key) or "{{$generator.birthdate_yyyymmdd()}}"
    return token, {
        "key": key,
        "label": label,
        "description": build_generator_description(
            impl_kind="random_birthdate_yyyymmdd",
            impl=impl,
            purpose=label,
            source="postman_import_rhs",
            var_name=var_name,
        ),
        "impl_kind": "random_birthdate_yyyymmdd",
        "impl": impl,
        "prompt": f"{label}. Aliases: {var_name}."[:2000],
    }


def apply_clear_rhs_fallbacks(
    intents: list[ScriptVarIntent],
) -> list[ScriptVarIntent]:
    """
    After AI: map remaining review items from clear RHS structure only.

    No Postman variable-name rules — Array.from length, pick lists, uuid tips,
    birth age constants in RHS/bindings.
    """
    out: list[ScriptVarIntent] = []
    for intent in intents:
        if intent.apply != "needs_review" or intent.kind not in {"unknown", "date"}:
            out.append(intent)
            continue
        expr = (intent.rhs or intent.evidence or "").strip()
        lower = expr.lower()
        binds = intent.related_bindings or {}
        bind_blob = "\n".join(str(v) for v in binds.values())

        if _UUID_TIP_RE.search(expr):
            token = finix_token_for_builtin_id("uuid")
            if token:
                out.append(
                    ScriptVarIntent(
                        name=intent.name,
                        source=intent.source,
                        kind="generator",
                        evidence=intent.evidence,
                        finix_token=token,
                        apply="auto",
                        rhs=intent.rhs,
                        related_bindings=intent.related_bindings,
                    )
                )
                continue

        arr = _ARRAY_FROM_LEN_RE.search(lower)
        if arr and (
            "math.random" in lower
            or "padstart" in lower
            or "join" in lower
        ):
            token, proposal = _digits_proposal(int(arr.group(1)), var_name=intent.name)
            out.append(
                ScriptVarIntent(
                    name=intent.name,
                    source=intent.source,
                    kind="generator",
                    evidence=intent.evidence,
                    finix_token=token,
                    apply="auto",
                    rhs=intent.rhs,
                    catalog_proposal=proposal,
                    related_bindings=intent.related_bindings,
                )
            )
            continue

        values: list[str] | None = None
        pick_m = _PICK_CALL_RE.search(expr)
        if pick_m:
            list_name = pick_m.group(1)
            values = _extract_string_list(binds.get(list_name) or "")
        if values is None and (
            "pick" in lower or "random" in lower or "choice" in lower
        ):
            values = _extract_string_list(expr)
        if values is None:
            for val in binds.values():
                if "pick" in lower or pick_m:
                    found = _extract_string_list(str(val))
                    if found:
                        values = found
                        break
        if values:
            picked = _list_proposal(values, var_name=intent.name)
            if picked:
                token, proposal = picked
                out.append(
                    ScriptVarIntent(
                        name=intent.name,
                        source=intent.source,
                        kind="generator",
                        evidence=intent.evidence,
                        finix_token=token,
                        apply="auto",
                        rhs=intent.rhs,
                        catalog_proposal=proposal,
                        related_bindings=intent.related_bindings,
                    )
                )
                continue

        ages_expr = _ages_from_text(expr)
        ages_bind = _ages_from_text(bind_blob)
        ages = ages_expr or ages_bind
        date_like = any(
            tip in lower
            for tip in (
                "getfullyear",
                "getutcyear",
                "getutcfullyear",
                "yyyymmdd",
                "padstart",
                "todatestring",
            )
        ) or "`" in expr
        # Ages on the format RHS, or sibling consts while RHS is a date template.
        if ages is not None and date_like and (ages_expr is not None or ages_bind is not None):
            lo, hi = ages
            token, proposal = _birth_proposal(
                var_name=intent.name,
                min_age=lo,
                max_age=hi,
            )
            out.append(
                ScriptVarIntent(
                    name=intent.name,
                    source=intent.source,
                    kind="generator",
                    evidence=intent.evidence,
                    finix_token=token,
                    apply="auto",
                    rhs=intent.rhs,
                    catalog_proposal=proposal,
                    related_bindings=intent.related_bindings,
                )
            )
            continue

        out.append(intent)
    return out


def build_script_import_plan(
    collection: Any,
    *,
    ai_rows: list[dict[str, Any]] | None = None,
    intents: list[ScriptVarIntent] | None = None,
) -> ScriptImportPlan:
    """Extract → AI merge → clear RHS fallback → template rewrite."""
    resolved = (
        list(intents)
        if intents is not None
        else extract_script_assignments(collection)
    )
    if ai_rows:
        resolved = merge_ai_intent_overrides(resolved, ai_rows)
    resolved = apply_clear_rhs_fallbacks(resolved)
    resolved = _apply_template_rewrites(resolved)
    overrides = build_auto_overrides(resolved)
    proposals = collect_catalog_proposals(resolved)
    notes = format_script_import_notes(resolved)
    return ScriptImportPlan(
        intents=resolved,
        auto_overrides=overrides,
        notes=notes,
        catalog_proposals=proposals,
    )

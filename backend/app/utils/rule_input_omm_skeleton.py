"""Build full input OMM/DTO key skeletons and merge into YAML rule inputs."""

from __future__ import annotations

import json
import re
from typing import Any, Final

import yaml

_MISSING = object()

_PRIMITIVE_JAVA_TYPES: Final[frozenset[str]] = frozenset(
    {
        "int",
        "integer",
        "long",
        "short",
        "byte",
        "double",
        "float",
        "boolean",
        "char",
        "void",
        "string",
        "bigdecimal",
        "biginteger",
        "number",
        "object",
        "date",
        "timestamp",
        "instant",
        "localdate",
        "localdatetime",
        "localtime",
        "zoneddatetime",
    }
)

_LIST_TYPE_RE = re.compile(
    r"(?:java\.util\.)?(?:List|Set|Collection|Iterable)\s*<\s*([\w.]+)\s*>",
    re.IGNORECASE,
)

_PRIVATE_FIELD_LINE = re.compile(
    r"^(?:@\w+(?:\([^)]*\))?\s*)*"
    r"private\s+(?!static\s+class\b)"
    r"(?:(?:static|final|volatile|transient)\s+)*"
    r"(?!class\b)([\w.<>,?\s]+?)\s+(\w+)\s*;\s*$"
)


def _simple_type_name(java_type: str) -> str:
    t = java_type.strip()
    t = re.sub(r"\s+", " ", t)
    if "." in t:
        t = t.rsplit(".", 1)[-1]
    return t.strip()


def _is_primitive_java_type(java_type: str) -> bool:
    base = _simple_type_name(java_type).lower()
    if "<" in base:
        base = base.split("<", 1)[0].strip()
    return base in _PRIMITIVE_JAVA_TYPES


def _list_element_type(java_type: str) -> str | None:
    m = _LIST_TYPE_RE.search(java_type.replace("java.util.", ""))
    if not m:
        return None
    inner = m.group(1).strip()
    return inner.rsplit(".", 1)[-1] if inner else None


def _extract_class_body(source: str, simple_class_name: str) -> str | None:
    m = re.search(rf"\bclass\s+{re.escape(simple_class_name)}\b", source)
    if not m:
        return None
    brace_open = source.find("{", m.end())
    if brace_open < 0:
        return None
    depth = 0
    for i in range(brace_open, len(source)):
        c = source[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return source[brace_open + 1 : i]
    return None


def _parse_top_level_private_fields(class_body: str) -> list[tuple[str, str]]:
    """Return (java_type, field_name) for fields declared at outer class depth only."""
    depth = 0
    out: list[tuple[str, str]] = []
    multi_decl = re.compile(r"(?<=\;)\s*(?=private\s+)")
    for line in class_body.splitlines():
        delta = line.count("{") - line.count("}")
        if depth == 0:
            stripped = line.strip()
            if stripped and not stripped.startswith("//") and not stripped.startswith("*"):
                for segment in multi_decl.split(stripped):
                    part = segment.strip()
                    if not part:
                        continue
                    m = _PRIVATE_FIELD_LINE.match(part)
                    if m:
                        out.append((m.group(1).strip(), m.group(2).strip()))
        depth += delta
        if depth < 0:
            depth = 0
    return out


def _java_field_to_skeleton_value(
    java_type: str,
    source: str,
    *,
    _depth: int,
    visiting: set[str],
    memo: dict[str, dict[str, Any]],
) -> Any:
    if _depth > 10:
        return None
    raw_type = java_type.strip()
    if not raw_type or raw_type == "void":
        return None

    list_inner = _list_element_type(raw_type)
    if list_inner is not None:
        if _is_primitive_java_type(list_inner):
            return []
        inner_sk = build_skeleton_from_java_source(
            source,
            list_inner,
            _depth=_depth + 1,
            visiting=visiting,
            memo=memo,
        )
        if inner_sk:
            return [inner_sk]
        return [{}]

    if _is_primitive_java_type(raw_type):
        return None

    simple = _simple_type_name(raw_type)
    nested = build_skeleton_from_java_source(
        source,
        simple,
        _depth=_depth + 1,
        visiting=visiting,
        memo=memo,
    )
    if nested:
        return nested
    return {}


def build_skeleton_from_java_source(
    source: str,
    simple_class_name: str,
    *,
    _depth: int = 0,
    visiting: set[str] | None = None,
    memo: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Parse a Java DTO class body and build a dict of field_name -> placeholder.

    Lists become [ { ... } ] with one item shaped like the element DTO when known.
    Unknown nested types become {}.
    """
    name = (simple_class_name or "").strip()
    if not name or not (source or "").strip():
        return {}

    vis = visiting if visiting is not None else set()
    mem = memo if memo is not None else {}

    if name in mem:
        return dict(mem[name])
    if name in vis:
        return {}
    vis.add(name)
    try:
        body = _extract_class_body(source, name)
        if body is None:
            return {}

        out: dict[str, Any] = {}
        for java_type, field_name in _parse_top_level_private_fields(body):
            out[field_name] = _java_field_to_skeleton_value(
                java_type,
                source,
                _depth=_depth,
                visiting=vis,
                memo=mem,
            )
        mem[name] = out
        return dict(out)
    finally:
        vis.discard(name)


def skeleton_from_catalog_raw_json(raw_json: str | None) -> dict[str, Any]:
    """Build { field: null | {} } from service catalog ``input_fields`` when present."""
    if not raw_json or not raw_json.strip():
        return {}
    try:
        payload = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError):
        return {}
    if not isinstance(payload, dict):
        return {}

    raw_fields = payload.get("input_fields")
    if isinstance(raw_fields, str) and raw_fields.strip():
        try:
            raw_fields = json.loads(raw_fields)
        except (json.JSONDecodeError, TypeError):
            raw_fields = None
    if not isinstance(raw_fields, list):
        return {}

    out: dict[str, Any] = {}
    for item in raw_fields:
        if not isinstance(item, dict):
            continue
        fname = item.get("field_name") or item.get("FIELD_NAME")
        if not (isinstance(fname, str) and fname.strip()):
            continue
        key = fname.strip()
        nested = item.get("nested_dto_class_name") or item.get("NESTED_DTO_CLASS_NAME")
        if isinstance(nested, str) and nested.strip():
            out[key] = {}
        else:
            out[key] = None
    return out


def _deep_union_two(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    """Union keys; merge nested dicts; merge first list item dict templates."""
    res: dict[str, Any] = {}
    for k in a:
        va = a[k]
        vb = b.get(k, _MISSING)
        if isinstance(va, dict) and isinstance(vb, dict):
            res[k] = _deep_union_two(va, vb)
        elif isinstance(va, dict):
            res[k] = dict(va)
        elif isinstance(vb, dict):
            res[k] = dict(vb)
        elif isinstance(va, list) and isinstance(vb, list):
            ta = va[0] if va and isinstance(va[0], dict) else None
            tb = vb[0] if vb and isinstance(vb[0], dict) else None
            if ta is not None or tb is not None:
                res[k] = [_deep_union_two(ta or {}, tb or {})]
            elif va or vb:
                res[k] = list(va or vb)
            else:
                res[k] = []
        elif vb is not _MISSING:
            res[k] = vb
        else:
            res[k] = va
    for k in b:
        if k in res:
            continue
        res[k] = b[k]
    return res


def deep_union_schema(*parts: dict[str, Any]) -> dict[str, Any]:
    """Merge several partial skeletons into one (keys union, nested dict merge)."""
    out: dict[str, Any] = {}
    for p in parts:
        if isinstance(p, dict) and p:
            out = _deep_union_two(out, p)
    return out


def union_inputs_from_rules_yaml(yaml_text: str) -> dict[str, Any]:
    """Union ``input`` / ``minimal_input`` maps from all rules in a YAML document."""
    if not yaml_text or not yaml_text.strip():
        return {}
    try:
        data = yaml.safe_load(yaml_text) or {}
    except (yaml.YAMLError, TypeError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    rules = data.get("rules")
    if not isinstance(rules, list):
        return {}
    merged: dict[str, Any] = {}
    for r in rules:
        if not isinstance(r, dict):
            continue
        inp = r.get("input")
        if not isinstance(inp, dict):
            inp = r.get("minimal_input")
        if isinstance(inp, dict):
            merged = _deep_union_two(merged, inp)
    return merged


def merge_skeleton_overlay(skeleton: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    """
    Start from skeleton keys (OMM completeness); overlay values win.

    Extra keys from overlay (LLM-only fields) are preserved.
    """
    if not skeleton:
        return dict(overlay) if isinstance(overlay, dict) else {}
    if not isinstance(overlay, dict):
        overlay = {}
    result: dict[str, Any] = {}
    for key, sk in skeleton.items():
        ov = overlay.get(key, _MISSING)
        if isinstance(sk, dict) and isinstance(ov, dict):
            result[key] = merge_skeleton_overlay(sk, ov)
        elif isinstance(sk, list) and sk and isinstance(sk[0], dict):
            tmpl: dict[str, Any] = sk[0]
            if isinstance(ov, list) and ov:
                merged_list: list[Any] = []
                for it in ov:
                    if isinstance(it, dict):
                        merged_list.append(merge_skeleton_overlay(tmpl, it))
                    else:
                        merged_list.append(it)
                result[key] = merged_list
            else:
                result[key] = [merge_skeleton_overlay(tmpl, {})]
        elif ov is not _MISSING:
            result[key] = ov
        else:
            result[key] = sk
    for key, ov in overlay.items():
        if key not in result:
            result[key] = ov
    return result


def merge_rule_inputs_with_skeleton(
    payload: dict[str, Any],
    skeleton: dict[str, Any] | None,
) -> dict[str, Any]:
    """Mutate ``payload['rules'][*].input`` by merging each with ``skeleton``."""
    if not skeleton:
        return payload
    rules = payload.get("rules")
    if not isinstance(rules, list):
        return payload
    for r in rules:
        if not isinstance(r, dict):
            continue
        inp = r.get("input")
        if not isinstance(inp, dict):
            inp = {}
        r["input"] = merge_skeleton_overlay(skeleton, inp)
    return payload


def build_input_skeleton_for_generation(
    *,
    in_dto: str | None,
    java_source: str | None,
    raw_catalog_json: str | None,
    existing_yaml: str | None,
) -> dict[str, Any]:
    """
    Aggregate skeleton from (in order): Java In DTO, catalog input_fields, existing YAML inputs.
    """
    parts: list[dict[str, Any]] = []
    dto = (in_dto or "").strip()
    src = (java_source or "").strip()
    if dto and src:
        sk = build_skeleton_from_java_source(src, dto)
        if sk:
            parts.append(sk)
    cat = skeleton_from_catalog_raw_json(raw_catalog_json)
    if cat:
        parts.append(cat)
    if existing_yaml and existing_yaml.strip():
        ex = union_inputs_from_rules_yaml(existing_yaml)
        if ex:
            parts.append(ex)
    return deep_union_schema(*parts) if parts else {}

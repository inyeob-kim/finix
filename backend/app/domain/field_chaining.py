"""Generic response-field extraction and request chaining inference (no service-specific rules)."""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any

from app.domain.scenario_bindings import ExtractSpec, InjectSpec, normalize_json_path_prefix
from app.utils.json_dot_paths import normalize_field_key, path_leaf

# Reusable business identifier patterns (field leaf names).
_REUSABLE_SUFFIX = re.compile(
    r"(Id|ID|Nbr|NBR|No|NO|Seq|SEQ|Key|KEY|Token|TOKEN|Ref|REF|Code|CODE|Num|NUM|Number|NUMBER)$",
)
_REUSABLE_EXACT = frozenset(
    {
        "id",
        "uuid",
        "guid",
        "token",
        "key",
        "ref",
        "reference",
        "code",
        "seq",
        "sequence",
    },
)

# Operation semantics from service / catalog labels (generic verbs).
_PRODUCER_WORDS = frozenset(
    {
        "open",
        "create",
        "register",
        "issue",
        "login",
        "apply",
        "init",
        "insert",
        "add",
        "new",
        "start",
        "generate",
        "allocate",
    },
)
_CONSUMER_WORDS = frozenset(
    {
        "close",
        "cancel",
        "revoke",
        "delete",
        "remove",
        "terminate",
        "end",
        "stop",
        "update",
        "modify",
        "change",
        "approve",
        "confirm",
        "complete",
    },
)
_INQUIRY_WORDS = frozenset(
    {
        "inquiry",
        "inquire",
        "query",
        "get",
        "search",
        "list",
        "retrieve",
        "select",
        "find",
        "view",
        "read",
        "detail",
        "fetch",
    },
)

_MAX_LINKS = 48
_MIN_MATCH_SCORE = 0.42


def _tokenize_label(text: str) -> set[str]:
    raw = (text or "").lower()
    parts = re.split(r"[^a-z0-9]+", raw)
    return {p for p in parts if len(p) >= 2}


def operation_roles(*labels: str) -> set[str]:
    """Infer producer / consumer / inquiry roles from service labels."""
    tokens: set[str] = set()
    for label in labels:
        tokens |= _tokenize_label(label)
    roles: set[str] = set()
    if tokens & _PRODUCER_WORDS:
        roles.add("producer")
    if tokens & _CONSUMER_WORDS:
        roles.add("consumer")
    if tokens & _INQUIRY_WORDS:
        roles.add("inquiry")
    return roles


def reusability_score(leaf_name: str) -> float:
    """Score how likely a field is a chainable business identifier (0..1)."""
    leaf = (leaf_name or "").strip()
    if not leaf:
        return 0.0
    norm = normalize_field_key(leaf)
    if norm in _REUSABLE_EXACT:
        return 0.95
    if _REUSABLE_SUFFIX.search(leaf):
        return 0.82
    if len(norm) >= 4 and norm.endswith(("id", "no", "nr", "cd")):
        return 0.55
    return 0.15


def _field_match_score(req_leaf: str, resp_leaf: str) -> float:
    req_key = normalize_field_key(req_leaf)
    resp_key = normalize_field_key(resp_leaf)
    if not req_key or not resp_key:
        return 0.0
    if req_key == resp_key:
        base = 1.0
    elif req_key in resp_key or resp_key in req_key:
        shorter = req_key if len(req_key) <= len(resp_key) else resp_key
        base = 0.78 if len(shorter) >= 4 else 0.55
    else:
        min_len = min(len(req_key), len(resp_key))
        if min_len >= 4 and req_key[-3:] == resp_key[-3:]:
            base = 0.48
        elif min_len >= 4:
            ratio = SequenceMatcher(None, req_key, resp_key).ratio()
            if ratio >= 0.62 and (
                reusability_score(req_leaf) >= 0.5 or reusability_score(resp_leaf) >= 0.5
            ):
                base = ratio * 0.82
            else:
                return 0.0
        else:
            return 0.0
    reuse = (reusability_score(req_leaf) + reusability_score(resp_leaf)) / 2.0
    return min(1.0, base * 0.75 + reuse * 0.35)


def _lifecycle_boost(
    prev_roles: set[str],
    cur_roles: set[str],
    req_leaf: str,
) -> float:
    """Boost when downstream op likely consumes upstream identifiers."""
    if not prev_roles or not cur_roles:
        return 0.0
    boost = 0.0
    if "producer" in prev_roles and ("consumer" in cur_roles or "inquiry" in cur_roles):
        boost += 0.12
    if "consumer" in cur_roles and reusability_score(req_leaf) >= 0.5:
        boost += 0.06
    return boost


def _var_name_for_link(resp_leaf: str, resp_path: str) -> str:
    leaf = (resp_leaf or path_leaf(resp_path) or "value").strip()
    if not leaf:
        return "value"
    if leaf[0].isdigit():
        return f"f_{leaf}"
    return leaf[:64]


def infer_adjacent_step_links(contexts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Infer extract/inject links between consecutive steps using catalog I/O paths only.

    Each context dict expects:
      index, service_code, service_name, input_paths, output_paths,
      input_paths_set, output_paths_set (optional).
    """
    if len(contexts) < 2:
        return []

    candidates: list[tuple[float, dict[str, Any]]] = []

    for i in range(1, len(contexts)):
        prev = contexts[i - 1]
        cur = contexts[i]
        prev_out: list[str] = prev.get("output_paths") or []
        cur_in: list[str] = cur.get("input_paths") or []
        if not prev_out or not cur_in:
            continue

        prev_roles = operation_roles(
            str(prev.get("service_name") or ""),
            str(prev.get("service_code") or ""),
        )
        cur_roles = operation_roles(
            str(cur.get("service_name") or ""),
            str(cur.get("service_code") or ""),
        )

        for req_path in cur_in:
            req_leaf = path_leaf(req_path)
            req_reuse = reusability_score(req_leaf)
            for resp_path in prev_out:
                resp_leaf = path_leaf(resp_path)
                match = _field_match_score(req_leaf, resp_leaf)
                if match < _MIN_MATCH_SCORE and req_reuse < 0.5:
                    continue
                score = match + _lifecycle_boost(prev_roles, cur_roles, req_leaf)
                score += req_reuse * 0.08 + reusability_score(resp_leaf) * 0.05
                if score < _MIN_MATCH_SCORE:
                    continue
                var = _var_name_for_link(resp_leaf, resp_path)
                candidates.append(
                    (
                        score,
                        {
                            "from_service_index": prev["index"],
                            "to_service_index": cur["index"],
                            "from_service_code": prev["service_code"],
                            "to_service_code": cur["service_code"],
                            "response_path": normalize_json_path_prefix(resp_path),
                            "request_path": normalize_json_path_prefix(req_path),
                            "var": var,
                            "confidence": "high" if score >= 0.85 else "medium",
                            "reason": "필드명·식별자 패턴·업무 흐름 휴리스틱",
                        },
                    ),
                )

    candidates.sort(key=lambda x: x[0], reverse=True)
    links: list[dict[str, Any]] = []
    used_req: set[tuple[int, str]] = set()
    used_resp: set[tuple[int, str]] = set()

    for _score, link in candidates:
        if len(links) >= _MAX_LINKS:
            break
        to_i = int(link["to_service_index"])
        req = link["request_path"]
        from_i = int(link["from_service_index"])
        resp = link["response_path"]
        req_key = (to_i, req)
        resp_key = (from_i, resp)
        if req_key in used_req or resp_key in used_resp:
            continue
        used_req.add(req_key)
        used_resp.add(resp_key)
        links.append(link)

    return links


def links_to_service_bindings(
    links: list[dict[str, Any]],
    service_codes: list[str],
) -> dict[str, tuple[list[ExtractSpec], list[InjectSpec]]]:
    """Map inferred links to per-service-code extract/inject lists."""
    extracts: dict[str, list[ExtractSpec]] = {c: [] for c in service_codes}
    injects: dict[str, list[InjectSpec]] = {c: [] for c in service_codes}
    seen_ext: set[tuple[str, str, str]] = set()
    seen_inj: set[tuple[str, str, str]] = set()

    for link in links:
        fc = link["from_service_code"]
        tc = link["to_service_code"]
        var = str(link["var"])
        ext_key = (fc, var, link["response_path"])
        inj_key = (tc, var, link["request_path"])
        if ext_key not in seen_ext:
            extracts[fc].append(ExtractSpec(var=var, json_path=link["response_path"]))
            seen_ext.add(ext_key)
        if inj_key not in seen_inj:
            injects[tc].append(InjectSpec(var=var, json_path=link["request_path"]))
            seen_inj.add(inj_key)

    return {code: (extracts.get(code, []), injects.get(code, [])) for code in service_codes}


def links_to_step_index_bindings(
    links: list[dict[str, Any]],
) -> dict[int, tuple[list[InjectSpec], list[ExtractSpec]]]:
    """Map links to 0-based step indices: extract on from-step, inject on to-step."""
    injects_by: dict[int, list[InjectSpec]] = {}
    extracts_by: dict[int, list[ExtractSpec]] = {}
    for link in links:
        from_i = int(link["from_service_index"])
        to_i = int(link["to_service_index"])
        var = str(link["var"])
        extracts_by.setdefault(from_i, []).append(
            ExtractSpec(var=var, json_path=link["response_path"]),
        )
        injects_by.setdefault(to_i, []).append(
            InjectSpec(var=var, json_path=link["request_path"]),
        )
    indices = set(injects_by) | set(extracts_by)
    return {
        i: (injects_by.get(i, []), extracts_by.get(i, []))
        for i in indices
    }


def merge_bindings_into_steps_json(
    steps_json: str | None,
    links: list[dict[str, Any]],
) -> str:
    """Append inferred bindings onto existing scenario steps (by step number)."""
    from app.utils.json_text import dumps_json, loads_json

    raw: list = loads_json(steps_json, [])
    step_bindings = links_to_step_index_bindings(links)
    for item in raw:
        if not isinstance(item, dict):
            continue
        num = item.get("number")
        if not isinstance(num, int) or num < 1:
            continue
        idx = num - 1
        if idx not in step_bindings:
            continue
        injects, extracts = step_bindings[idx]
        existing_inj = item.get("injects") if isinstance(item.get("injects"), list) else []
        existing_ext = item.get("extracts") if isinstance(item.get("extracts"), list) else []
        item["injects"] = existing_inj + [s.model_dump() for s in injects]
        item["extracts"] = existing_ext + [s.model_dump() for s in extracts]
        item["chaining_auto"] = True
    return dumps_json(raw)


def count_binding_rows_in_steps(steps_json: str | None) -> int:
    from app.services.scenario_run_resolver import bindings_by_logical_step

    total = 0
    for inj, ext, ov in bindings_by_logical_step(steps_json).values():
        total += len(inj) + len(ext) + len(ov)
    return total

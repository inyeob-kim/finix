"""Deterministic apply/fallback for Postman → YAML create and merge plans."""

from __future__ import annotations

import re
from typing import Any

from app.domain.postman_collection_parse import PostmanRequestCandidate
from app.domain.postman_rules_plans import (
    CreateCaseSpec,
    CreatePlan,
    ExpectHint,
    InputStrategy,
    MergeDecision,
    MergeDiff,
    MergePlan,
    RulesPayload,
)
from app.utils.rule_input_omm_skeleton import merge_skeleton_overlay

_ERROR_NAME_RE = re.compile(
    r"(error|fail|reject|거절|오류|실패|부족|초과|invalid|violation|exception|"
    r"missing|bizrule|biz_rule|validation)",
    re.IGNORECASE,
)
_ERROR_FOLDER_RE = re.compile(
    r"(^|/)(validation|bizrule|biz_rule|negative|error)(/|$)",
    re.IGNORECASE,
)
_MACRO_RE = re.compile(r"\{\{[^{}]+\}\}")
_POSTMAN_ERROR_CODE_RE = re.compile(
    r"(?:messageId|error[_]?code|errorCode)\s*[:=)]?\s*['\"]([A-Z][A-Z0-9_]{3,})['\"]"
    r"|['\"]([A-Z]{2,}[A-Z0-9]*E\d{3,5})['\"]",
    re.IGNORECASE,
)


def _looks_like_error_case(candidate: PostmanRequestCandidate) -> bool:
    """Heuristic for fallback create when LLM is unavailable."""
    folder = candidate.folder or ""
    if _ERROR_FOLDER_RE.search(folder.replace("\\", "/")):
        return True
    blob = f"{folder}\n{candidate.name}\n{candidate.description}"
    return bool(_ERROR_NAME_RE.search(blob))


def _next_case_id(service_code: str, rule_type: str, used: set[str]) -> str:
    prefix = f"{service_code}-{rule_type}-"
    n = 1
    while True:
        cid = f"{prefix}{n:03d}"
        if cid not in used:
            used.add(cid)
            return cid
        n += 1


def _source_evidence(candidate: PostmanRequestCandidate) -> dict[str, str]:
    snippet = candidate.name
    if candidate.folder:
        snippet = f"{candidate.folder} / {candidate.name}"
    return {"method": "postman_import", "snippet": snippet[:200]}


def _looks_like_macro(value: Any) -> bool:
    return isinstance(value, str) and bool(_MACRO_RE.search(value))


def _apply_input_strategy(
    *,
    strategy: InputStrategy,
    skeleton: dict[str, Any],
    base_input: dict[str, Any] | None,
    postman_body: dict[str, Any],
) -> dict[str, Any]:
    base = dict(base_input) if isinstance(base_input, dict) else {}
    body = dict(postman_body) if isinstance(postman_body, dict) else {}
    if strategy == "keep_base_macros":
        merged = merge_skeleton_overlay(skeleton, {**body, **base})
        for key, val in base.items():
            if _looks_like_macro(val):
                merged[key] = val
        return merged
    if strategy == "fill_nulls_only":
        overlay: dict[str, Any] = {}
        for key, val in body.items():
            cur = base.get(key, None)
            if cur is None or cur == "" or cur == {}:
                overlay[key] = val
        return merge_skeleton_overlay(skeleton, {**base, **overlay})
    # overlay_postman_values
    return merge_skeleton_overlay(skeleton, {**base, **body})


def reindex_candidates(
    candidates: list[PostmanRequestCandidate],
) -> list[PostmanRequestCandidate]:
    """Renumber ``index`` to 0..n-1 for a per-service candidate group.

    Collection-wide indices must not be used as list positions after grouping.
    """
    return [
        PostmanRequestCandidate(
            index=i,
            name=c.name,
            folder=c.folder,
            method=c.method,
            path=c.path,
            body=c.body,
            description=c.description,
            test_script_excerpt=c.test_script_excerpt,
        )
        for i, c in enumerate(candidates)
    ]


def _lookup_candidate(
    candidates: list[PostmanRequestCandidate], index: int
) -> PostmanRequestCandidate | None:
    """Resolve by ``candidate.index`` first; fall back to list position."""
    for c in candidates:
        if c.index == index:
            return c
    if 0 <= index < len(candidates):
        return candidates[index]
    return None


def _merged_body(
    candidates: list[PostmanRequestCandidate], indices: list[int]
) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for i in indices:
        found = _lookup_candidate(candidates, i)
        if found is None:
            continue
        body = found.body
        if isinstance(body, dict):
            merged.update(body)
    return merged


def _sibling_body_same_path(
    candidates: list[PostmanRequestCandidate],
    *,
    path: str,
    exclude_index: int,
) -> dict[str, Any] | None:
    """When a request body is empty (common Postman 'Copy'), reuse same-path sibling."""
    for c in candidates:
        if c.index == exclude_index:
            continue
        if (c.path or "") != (path or ""):
            continue
        if isinstance(c.body, dict) and c.body:
            return dict(c.body)
    return None


def _resolve_postman_body(
    candidates: list[PostmanRequestCandidate],
    *,
    indices: list[int],
    notes: list[str],
) -> dict[str, Any]:
    body = _merged_body(candidates, indices)
    if body:
        return body
    for i in indices:
        c = _lookup_candidate(candidates, i)
        if c is None:
            notes.append(f"candidate index {i} not found in service group")
            continue
        sibling = _sibling_body_same_path(
            candidates, path=c.path, exclude_index=c.index
        )
        if sibling:
            notes.append(
                f"candidate {c.index} body empty; reused same-path body "
                f"from sibling (Postman Copy often exports empty body)"
            )
            return sibling
        notes.append(
            f"candidate {c.index} «{c.name}» has empty/unparsed body → input may be {{}}"
        )
    return {}


def _normalize_outcome(raw: str | None, *, rule_type: str) -> str:
    """Coerce AI/Postman outcome hints to schema ``error|success``."""
    text = (raw or "").strip().lower()
    if text in {"error", "success"}:
        return text
    if text in {
        "fail",
        "failed",
        "failure",
        "reject",
        "rejected",
        "rejection",
        "invalid",
        "exception",
        "negative",
        "err",
        "false",
        "거절",
        "실패",
        "오류",
    }:
        return "error"
    if text in {
        "ok",
        "pass",
        "passed",
        "happy",
        "normal",
        "true",
        "성공",
        "정상",
    }:
        return "success"
    return "error" if rule_type == "E" else "success"


def _extract_error_code_from_text(*parts: str) -> str | None:
    blob = "\n".join(p for p in parts if p)
    if not blob.strip():
        return None
    m = _POSTMAN_ERROR_CODE_RE.search(blob)
    if not m:
        return None
    return (m.group(1) or m.group(2) or "").strip() or None


def _expect_from_hint(
    hint: ExpectHint,
    rule_type: str,
    *,
    candidate: PostmanRequestCandidate | None = None,
) -> dict[str, Any]:
    expect: dict[str, Any] = {}
    expect["outcome"] = _normalize_outcome(hint.outcome, rule_type=rule_type)
    error_code = (hint.error_code or "").strip() if hint.error_code else ""
    if not error_code and candidate is not None and rule_type == "E":
        error_code = (
            _extract_error_code_from_text(
                candidate.test_script_excerpt,
                candidate.description,
                candidate.name,
            )
            or ""
        )
    if rule_type == "E":
        # null allowed for draft/Postman until a concrete CBS code is known
        expect["error_code"] = error_code or None
    elif error_code:
        expect["error_code"] = error_code
    if hint.http_status is not None:
        expect["http_status"] = hint.http_status
    elif rule_type == "N":
        expect["http_status"] = 200
    elif rule_type == "E":
        expect["http_status"] = 400
    if rule_type == "N" and "validation_target" not in expect:
        expect["validation_target"] = "response matches expected outcome"
    return expect


def fallback_create_plan(
    candidates: list[PostmanRequestCandidate],
) -> CreatePlan:
    cases: list[CreateCaseSpec] = []
    for c in candidates:
        is_error = _looks_like_error_case(c)
        rule_type = "E" if is_error else "N"
        title = (c.name or f"case-{c.index}")[:120]
        description = (c.description or "").strip()
        if not description:
            # Prefer folder context over repeating the raw request name.
            folder_tail = (c.folder or "").rsplit("/", 1)[-1].strip()
            if folder_tail and folder_tail.lower() not in title.lower():
                description = f"{folder_tail}: {title}"
            else:
                description = title
        cases.append(
            CreateCaseSpec(
                candidate_indices=[c.index],
                rule_type=rule_type,  # type: ignore[arg-type]
                title=title,
                description=description[:500],
                expect_hint=ExpectHint(
                    outcome="error" if rule_type == "E" else "success",
                    http_status=400 if rule_type == "E" else 200,
                ),
                rationale="fallback",
            )
        )
    return CreatePlan(cases=cases)


def apply_create_plan(
    *,
    service_code: str,
    service_name: str,
    candidates: list[PostmanRequestCandidate],
    plan: CreatePlan | None,
    skeleton: dict[str, Any] | None,
) -> tuple[RulesPayload, MergeDiff]:
    skel = skeleton if isinstance(skeleton, dict) else {}
    effective = plan if plan and plan.cases else fallback_create_plan(candidates)
    used_ids: set[str] = set()
    covered: set[int] = set()
    rules: list[dict[str, Any]] = []
    notes: list[str] = []

    for spec in effective.cases:
        ordered: list[PostmanRequestCandidate] = []
        seen: set[int] = set()
        for i in spec.candidate_indices:
            found = _lookup_candidate(candidates, i)
            if found is None or found.index in seen:
                continue
            seen.add(found.index)
            ordered.append(found)
        indices = [c.index for c in ordered]
        if not indices:
            notes.append("skipped create case with invalid candidate_indices")
            continue
        if not (spec.title or "").strip():
            notes.append(f"empty title for candidates {indices}; used fallback name")
        primary = ordered[0]
        for i in indices:
            covered.add(i)
        rule_type = spec.rule_type if spec.rule_type in {"E", "N"} else "N"
        case_id = _next_case_id(service_code, rule_type, used_ids)
        body = _resolve_postman_body(
            candidates, indices=indices, notes=notes
        )
        rule: dict[str, Any] = {
            "case_id": case_id,
            "rule_type": rule_type,
            "title": (spec.title or primary.name).strip()[:200],
            "description": (spec.description or primary.description or primary.name).strip()[
                :1000
            ],
            "tags": ["input"] if rule_type == "E" else ["business"],
            "input": _apply_input_strategy(
                strategy="overlay_postman_values",
                skeleton=skel,
                base_input={},
                postman_body=body,
            ),
            "expect": _expect_from_hint(
                spec.expect_hint, rule_type, candidate=primary
            ),
            "assertions": [],
            "source_evidence": _source_evidence(primary),
        }
        rules.append(rule)
        if len(indices) > 1:
            notes.append(f"merged candidates {indices} into {case_id}")

    for c in candidates:
        if c.index in covered:
            continue
        rule_type = "N"
        case_id = _next_case_id(service_code, rule_type, used_ids)
        body = _resolve_postman_body(
            candidates, indices=[c.index], notes=notes
        )
        rules.append(
            {
                "case_id": case_id,
                "rule_type": rule_type,
                "title": c.name[:120] or f"case-{c.index}",
                "description": (c.description or c.name)[:500],
                "tags": ["business"],
                "input": _apply_input_strategy(
                    strategy="overlay_postman_values",
                    skeleton=skel,
                    base_input={},
                    postman_body=body,
                ),
                "expect": _expect_from_hint(
                    ExpectHint(outcome="success", http_status=200),
                    rule_type,
                    candidate=c,
                ),
                "assertions": [],
                "source_evidence": _source_evidence(c),
            }
        )
        notes.append(f"fallback create for candidate {c.index}")

    diff = MergeDiff(updated=0, added=len(rules), kept=0, notes=notes)
    return (
        RulesPayload(
            service_code=service_code,
            service_name=service_name or service_code,
            rules=rules,
        ),
        diff,
    )


def _input_signature(inp: dict[str, Any] | None) -> frozenset[str]:
    if not isinstance(inp, dict):
        return frozenset()
    return frozenset(str(k) for k in inp.keys())


def _find_case_id_in_text(text: str, known: set[str]) -> str | None:
    for cid in known:
        if cid and cid in text:
            return cid
    return None


def fallback_merge_plan(
    *,
    base_rules: list[dict[str, Any]],
    candidates: list[PostmanRequestCandidate],
) -> MergePlan:
    known = {
        str(r.get("case_id")).strip()
        for r in base_rules
        if isinstance(r, dict) and str(r.get("case_id") or "").strip()
    }
    by_sig: dict[frozenset[str], str] = {}
    for r in base_rules:
        if not isinstance(r, dict):
            continue
        cid = str(r.get("case_id") or "").strip()
        if not cid:
            continue
        sig = _input_signature(r.get("input") if isinstance(r.get("input"), dict) else None)
        if sig and sig not in by_sig:
            by_sig[sig] = cid

    decisions: list[MergeDecision] = []
    used_match: set[str] = set()
    for c in candidates:
        meta = _find_case_id_in_text(
            f"{c.description}\n{c.name}\n{c.folder}", known
        )
        if meta and meta not in used_match:
            used_match.add(meta)
            decisions.append(
                MergeDecision(
                    candidate_index=c.index,
                    action="match",
                    match_case_id=meta,
                    input_strategy="overlay_postman_values",
                    rationale="fallback meta case_id",
                )
            )
            continue
        sig = _input_signature(c.body)
        hit = by_sig.get(sig)
        if hit and hit not in used_match:
            used_match.add(hit)
            decisions.append(
                MergeDecision(
                    candidate_index=c.index,
                    action="match",
                    match_case_id=hit,
                    input_strategy="overlay_postman_values",
                    rationale="fallback input signature",
                )
            )
            continue
        decisions.append(
            MergeDecision(
                candidate_index=c.index,
                action="add",
                title=c.name[:120],
                description=(c.description or c.name)[:500],
                rationale="fallback add",
            )
        )
    return MergePlan(decisions=decisions)


def apply_merge_plan(
    *,
    service_code: str,
    service_name: str,
    base_rules: list[dict[str, Any]],
    candidates: list[PostmanRequestCandidate],
    plan: MergePlan | None,
    skeleton: dict[str, Any] | None,
) -> tuple[RulesPayload, MergeDiff]:
    skel = skeleton if isinstance(skeleton, dict) else {}
    base_by_id: dict[str, dict[str, Any]] = {}
    for r in base_rules:
        if not isinstance(r, dict):
            continue
        cid = str(r.get("case_id") or "").strip()
        if cid:
            base_by_id[cid] = dict(r)

    effective = (
        plan
        if plan and plan.decisions
        else fallback_merge_plan(base_rules=base_rules, candidates=candidates)
    )
    cand_by_index = {c.index: c for c in candidates}
    matched_ids: set[str] = set()
    notes: list[str] = []
    updated = 0
    added = 0
    # Start from a copy of all base rules; replace on match
    working = {cid: dict(rule) for cid, rule in base_by_id.items()}
    used_ids = set(working.keys())

    for dec in effective.decisions:
        cand = cand_by_index.get(dec.candidate_index)
        if cand is None:
            notes.append(f"skip decision for missing candidate {dec.candidate_index}")
            continue
        action = dec.action
        match_id = (dec.match_case_id or "").strip() or None
        if action == "match":
            if not match_id or match_id not in working or match_id in matched_ids:
                action = "add"
                notes.append(
                    f"demoted match→add for candidate {cand.index} "
                    f"(case_id={match_id!r})"
                )
                match_id = None
            else:
                base = working[match_id]
                base_input = base.get("input") if isinstance(base.get("input"), dict) else {}
                strategy: InputStrategy = dec.input_strategy
                if strategy not in {
                    "overlay_postman_values",
                    "keep_base_macros",
                    "fill_nulls_only",
                }:
                    strategy = "overlay_postman_values"
                match_notes: list[str] = []
                postman_body = _resolve_postman_body(
                    candidates, indices=[cand.index], notes=match_notes
                )
                notes.extend(match_notes)
                base["input"] = _apply_input_strategy(
                    strategy=strategy,
                    skeleton=skel,
                    base_input=base_input,
                    postman_body=postman_body,
                )
                # Never touch expect/assertions/case_id from LLM
                matched_ids.add(match_id)
                updated += 1
                continue

        # add
        rule_type = "N"
        case_id = _next_case_id(service_code, rule_type, used_ids)
        title = (dec.title or cand.name).strip()[:200]
        description = (dec.description or cand.description or cand.name).strip()[:1000]
        add_notes: list[str] = []
        body = _resolve_postman_body(
            candidates, indices=[cand.index], notes=add_notes
        )
        notes.extend(add_notes)
        working[case_id] = {
            "case_id": case_id,
            "rule_type": rule_type,
            "title": title,
            "description": description,
            "tags": ["business"],
            "input": _apply_input_strategy(
                strategy="overlay_postman_values",
                skeleton=skel,
                base_input={},
                postman_body=body,
            ),
            "expect": _expect_from_hint(
                ExpectHint(outcome="success", http_status=200),
                "N",
                candidate=cand,
            ),
            "assertions": [],
            "source_evidence": _source_evidence(cand),
        }
        added += 1

    kept = len(base_by_id) - updated
    result_rules = list(working.values())
    diff = MergeDiff(updated=updated, added=added, kept=kept, notes=notes)
    return (
        RulesPayload(
            service_code=service_code,
            service_name=service_name or service_code,
            rules=result_rules,
        ),
        diff,
    )

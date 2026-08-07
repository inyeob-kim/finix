"""
Shared YAML rule merge helpers (Postman import + source AI generation).

Input strategies and case_id allocation are reused by Postman apply paths.
Source generation uses ``apply_yaml_rules_merge_plan`` to merge LLM-emitted
rules into an existing base without dropping Postman macros / expects.

Match input strategy is fixed by entry point (see POSTMAN_MATCH_INPUT_STRATEGY /
SOURCE_MATCH_INPUT_STRATEGY); the AI merge plan decides match vs add only.
"""

from __future__ import annotations

import re
from typing import Any

from app.domain.postman_rules_plans import (
    InputStrategy,
    MergeDecision,
    MergeDiff,
    MergePlan,
    RulesPayload,
)
from app.utils.rule_input_omm_skeleton import merge_skeleton_overlay

_MACRO_RE = re.compile(r"\{\{[^{}]+\}\}")


def looks_like_macro(value: Any) -> bool:
    return isinstance(value, str) and bool(_MACRO_RE.search(value))


def next_case_id(service_code: str, rule_type: str, used: set[str]) -> str:
    prefix = f"{service_code}-{rule_type}-"
    n = 1
    while True:
        cid = f"{prefix}{n:03d}"
        if cid not in used:
            used.add(cid)
            return cid
        n += 1


def apply_input_strategy(
    *,
    strategy: InputStrategy,
    skeleton: dict[str, Any],
    base_input: dict[str, Any] | None,
    incoming_body: dict[str, Any],
) -> dict[str, Any]:
    """Merge skeleton + base + incoming body according to *strategy*."""
    base = dict(base_input) if isinstance(base_input, dict) else {}
    body = dict(incoming_body) if isinstance(incoming_body, dict) else {}
    if strategy == "keep_base_macros":
        merged = merge_skeleton_overlay(skeleton, {**body, **base})
        for key, val in base.items():
            if looks_like_macro(val):
                merged[key] = val
        return merged
    if strategy == "fill_nulls_only":
        overlay: dict[str, Any] = {}
        for key, val in body.items():
            cur = base.get(key, None)
            if cur is None or cur == "" or cur == {}:
                overlay[key] = val
        return merge_skeleton_overlay(skeleton, {**base, **overlay})
    # overlay_postman_values (also used for source overlay)
    return merge_skeleton_overlay(skeleton, {**base, **body})


def summarize_base_rule(rule: dict[str, Any]) -> dict[str, Any]:
    """Compact rule summary for merge-plan LLM prompts."""
    inp = rule.get("input") if isinstance(rule.get("input"), dict) else {}
    expect = rule.get("expect") if isinstance(rule.get("expect"), dict) else {}
    return {
        "case_id": rule.get("case_id"),
        "rule_type": rule.get("rule_type"),
        "title": rule.get("title") or rule.get("description"),
        "description": str(rule.get("description") or "")[:300],
        "input_keys": list(inp.keys())[:40],
        "input_preview": {k: inp[k] for k in list(inp.keys())[:12]},
        "expect_outcome": expect.get("outcome"),
        "error_code": expect.get("error_code"),
    }


def extract_rules_list(parsed: Any) -> list[dict[str, Any]]:
    """Pull ``rules`` list from a parsed YAML/JSON document."""
    if isinstance(parsed, list):
        return [r for r in parsed if isinstance(r, dict)]
    if not isinstance(parsed, dict):
        return []
    rules = parsed.get("rules")
    if not isinstance(rules, list):
        return []
    return [r for r in rules if isinstance(r, dict)]


def merge_candidate_payload_from_rule(
    index: int,
    rule: dict[str, Any],
) -> dict[str, Any]:
    """Shape a generated YAML rule like a Postman merge candidate for the LLM."""
    inp = rule.get("input") if isinstance(rule.get("input"), dict) else {}
    expect = rule.get("expect") if isinstance(rule.get("expect"), dict) else {}
    title = str(rule.get("title") or rule.get("description") or f"case-{index}")
    return {
        "index": index,
        "name": title[:200],
        "folder": str(rule.get("rule_type") or "N"),
        "method": "",
        "path": "",
        "body": inp,
        "description": str(rule.get("description") or title)[:500],
        "test_script_excerpt": str(expect)[:800],
        "rule_type": str(rule.get("rule_type") or "N"),
        "expect_outcome": expect.get("outcome"),
        "error_code": expect.get("error_code"),
    }


def fallback_yaml_rules_merge_plan(
    generated_rules: list[dict[str, Any]],
) -> MergePlan:
    """When merge LLM fails: keep base, add every generated rule as new."""
    decisions: list[MergeDecision] = []
    for i, rule in enumerate(generated_rules):
        title = str(rule.get("title") or rule.get("description") or f"case-{i}")
        decisions.append(
            MergeDecision(
                candidate_index=i,
                action="add",
                title=title[:200],
                description=str(rule.get("description") or title)[:1000],
            )
        )
    return MergePlan(decisions=decisions)


def apply_yaml_rules_merge_plan(
    *,
    service_code: str,
    service_name: str,
    base_rules: list[dict[str, Any]],
    generated_rules: list[dict[str, Any]],
    plan: MergePlan | None,
    skeleton: dict[str, Any] | None,
    match_input_strategy: InputStrategy | None = None,
) -> tuple[RulesPayload, MergeDiff]:
    """
    Merge source-generated rules into *base_rules*.

    - ``match``: update input only (preserve expect / case_id / title).
    - ``add``: append generated rule with a new case_id (keep E/N + expect).

    When *match_input_strategy* is set (recommended for source→YAML), it overrides
    any per-decision strategy from the AI plan.
    """
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
        else fallback_yaml_rules_merge_plan(generated_rules)
    )
    gen_by_index = {
        i: dict(r)
        for i, r in enumerate(generated_rules)
        if isinstance(r, dict)
    }
    matched_ids: set[str] = set()
    notes: list[str] = []
    updated = 0
    added = 0
    working = {cid: dict(rule) for cid, rule in base_by_id.items()}
    used_ids = set(working.keys())

    for dec in effective.decisions:
        gen = gen_by_index.get(dec.candidate_index)
        if gen is None:
            notes.append(f"skip decision for missing candidate {dec.candidate_index}")
            continue
        action = dec.action
        match_id = (dec.match_case_id or "").strip() or None
        gen_input = gen.get("input") if isinstance(gen.get("input"), dict) else {}

        if action == "match":
            if not match_id or match_id not in working or match_id in matched_ids:
                action = "add"
                notes.append(
                    f"demoted match→add for candidate {dec.candidate_index} "
                    f"(case_id={match_id!r})"
                )
                match_id = None
            else:
                base = working[match_id]
                base_input = (
                    base.get("input") if isinstance(base.get("input"), dict) else {}
                )
                strategy: InputStrategy = (
                    match_input_strategy
                    if match_input_strategy is not None
                    else dec.input_strategy
                )
                if strategy not in {
                    "overlay_postman_values",
                    "keep_base_macros",
                    "fill_nulls_only",
                }:
                    strategy = "fill_nulls_only"
                base["input"] = apply_input_strategy(
                    strategy=strategy,
                    skeleton=skel,
                    base_input=base_input,
                    incoming_body=gen_input,
                )
                matched_ids.add(match_id)
                updated += 1
                continue

        # add — preserve generated rule shape (E/N, expect, assertions)
        rule_type = str(gen.get("rule_type") or "N").strip().upper()
        if rule_type not in {"E", "N"}:
            rule_type = "N"
        case_id = next_case_id(service_code, rule_type, used_ids)
        title = (dec.title or str(gen.get("title") or "")).strip()[:200]
        description = (
            dec.description or str(gen.get("description") or title)
        ).strip()[:1000]
        new_rule = dict(gen)
        new_rule["case_id"] = case_id
        new_rule["rule_type"] = rule_type
        if title:
            new_rule["title"] = title
        if description:
            new_rule["description"] = description
        new_rule["input"] = apply_input_strategy(
            strategy="overlay_postman_values",
            skeleton=skel,
            base_input={},
            incoming_body=gen_input,
        )
        evidence = new_rule.get("source_evidence")
        if not isinstance(evidence, dict):
            evidence = {}
        new_rule["source_evidence"] = {
            **evidence,
            "method": str(evidence.get("method") or "source_ai"),
            "snippet": str(
                evidence.get("snippet") or title or case_id
            )[:200],
        }
        working[case_id] = new_rule
        added += 1

    kept = len(base_by_id) - updated
    return (
        RulesPayload(
            service_code=service_code,
            service_name=service_name or service_code,
            rules=list(working.values()),
        ),
        MergeDiff(updated=updated, added=added, kept=kept, notes=notes),
    )

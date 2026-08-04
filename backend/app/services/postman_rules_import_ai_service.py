"""LLM planning for Postman → YAML create/merge (plans only, no YAML assembly)."""

from __future__ import annotations

import json
import re
from typing import Any

from app.domain.postman_collection_parse import PostmanRequestCandidate
from app.domain.postman_rules_plans import (
    CreateCaseSpec,
    CreatePlan,
    ExpectHint,
    MergeDecision,
    MergePlan,
)
from app.integrations.llm_client import LlmClient
from app.prompts.postman_rules_create_prompt import (
    build_create_system_prompt,
    build_create_user_prompt,
)
from app.prompts.postman_rules_merge_prompt import (
    build_merge_system_prompt,
    build_merge_user_prompt,
)

_FENCE_RE = re.compile(r"^```[a-zA-Z0-9_-]*\n|\n```$", re.MULTILINE)


def _strip_json_fences(text: str) -> str:
    t = (text or "").strip().replace("\r\n", "\n")
    return _FENCE_RE.sub("", t).strip()


def _loads_json_object(raw: str) -> dict[str, Any]:
    text = _strip_json_fences(raw)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("plan response is not a JSON object")
    return data


def _candidate_payload(c: PostmanRequestCandidate) -> dict[str, Any]:
    return {
        "index": c.index,
        "name": c.name,
        "folder": c.folder,
        "method": c.method,
        "path": c.path,
        "body": c.body,
        "description": c.description[:500],
        "test_script_excerpt": c.test_script_excerpt[:800],
    }


def _summarize_base_rule(rule: dict[str, Any]) -> dict[str, Any]:
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


def _parse_expect_hint(raw: Any) -> ExpectHint:
    if not isinstance(raw, dict):
        return ExpectHint()
    status = raw.get("http_status")
    try:
        http_status = int(status) if status is not None and status != "" else None
    except (TypeError, ValueError):
        http_status = None
    outcome_raw = raw.get("outcome")
    if outcome_raw is None or outcome_raw == "":
        outcome = None
    else:
        outcome = str(outcome_raw).strip()
    return ExpectHint(
        outcome=outcome,
        error_code=str(raw["error_code"]).strip() if raw.get("error_code") else None,
        http_status=http_status,
    )


def parse_create_plan_dict(data: dict[str, Any]) -> CreatePlan:
    cases_raw = data.get("cases")
    if not isinstance(cases_raw, list):
        raise ValueError("create plan missing cases")
    cases: list[CreateCaseSpec] = []
    for item in cases_raw:
        if not isinstance(item, dict):
            continue
        indices = item.get("candidate_indices")
        if not isinstance(indices, list) or not indices:
            continue
        idx_list = [int(i) for i in indices]
        rtype = str(item.get("rule_type") or "N").strip().upper()
        if rtype not in {"E", "N"}:
            rtype = "N"
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        cases.append(
            CreateCaseSpec(
                candidate_indices=idx_list,
                rule_type=rtype,  # type: ignore[arg-type]
                title=title,
                description=str(item.get("description") or title).strip(),
                expect_hint=_parse_expect_hint(item.get("expect_hint")),
                rationale=str(item.get("rationale") or "").strip(),
            )
        )
    if not cases:
        raise ValueError("create plan has no valid cases")
    return CreatePlan(cases=cases)


def parse_merge_plan_dict(data: dict[str, Any]) -> MergePlan:
    decisions_raw = data.get("decisions")
    if not isinstance(decisions_raw, list):
        raise ValueError("merge plan missing decisions")
    decisions: list[MergeDecision] = []
    for item in decisions_raw:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("candidate_index"))
        except (TypeError, ValueError):
            continue
        action = str(item.get("action") or "add").strip().lower()
        if action not in {"match", "add"}:
            action = "add"
        strategy = str(item.get("input_strategy") or "overlay_postman_values").strip()
        if strategy not in {
            "overlay_postman_values",
            "keep_base_macros",
            "fill_nulls_only",
        }:
            strategy = "overlay_postman_values"
        decisions.append(
            MergeDecision(
                candidate_index=idx,
                action=action,  # type: ignore[arg-type]
                match_case_id=(
                    str(item["match_case_id"]).strip()
                    if item.get("match_case_id")
                    else None
                ),
                input_strategy=strategy,  # type: ignore[arg-type]
                title=str(item.get("title") or "").strip(),
                description=str(item.get("description") or "").strip(),
                rationale=str(item.get("rationale") or "").strip(),
            )
        )
    if not decisions:
        raise ValueError("merge plan has no valid decisions")
    return MergePlan(decisions=decisions)


class PostmanRulesImportAiService:
    """Produce create/merge plans via LLM."""

    def __init__(self, *, llm: LlmClient) -> None:
        self._llm = llm

    async def plan_create(
        self,
        *,
        service_code: str,
        service_name: str,
        skeleton_keys: list[str],
        candidates: list[PostmanRequestCandidate],
    ) -> CreatePlan:
        raw = await self._llm.complete_json(
            system_prompt=build_create_system_prompt(),
            user_prompt=build_create_user_prompt(
                service_code=service_code,
                service_name=service_name,
                skeleton_keys=skeleton_keys,
                candidates=[_candidate_payload(c) for c in candidates],
            ),
        )
        return parse_create_plan_dict(_loads_json_object(raw))

    async def plan_merge(
        self,
        *,
        service_code: str,
        skeleton_keys: list[str],
        base_rules: list[dict[str, Any]],
        candidates: list[PostmanRequestCandidate],
    ) -> MergePlan:
        summary = [_summarize_base_rule(r) for r in base_rules if isinstance(r, dict)]
        raw = await self._llm.complete_json(
            system_prompt=build_merge_system_prompt(),
            user_prompt=build_merge_user_prompt(
                service_code=service_code,
                skeleton_keys=skeleton_keys,
                base_rules_summary=summary,
                candidates=[_candidate_payload(c) for c in candidates],
            ),
        )
        return parse_merge_plan_dict(_loads_json_object(raw))

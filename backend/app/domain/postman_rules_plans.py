"""Typed plans for Postman → YAML create/merge (AI output + apply input)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

InputStrategy = Literal[
    "overlay_postman_values",
    "keep_base_macros",
    "fill_nulls_only",
]
RuleType = Literal["E", "N"]
MergeAction = Literal["match", "add"]


@dataclass
class ExpectHint:
    outcome: str | None = None
    error_code: str | None = None
    http_status: int | None = None


@dataclass
class CreateCaseSpec:
    candidate_indices: list[int]
    rule_type: RuleType
    title: str
    description: str
    expect_hint: ExpectHint = field(default_factory=ExpectHint)
    rationale: str = ""


@dataclass
class CreatePlan:
    cases: list[CreateCaseSpec] = field(default_factory=list)


@dataclass
class MergeDecision:
    candidate_index: int
    action: MergeAction
    match_case_id: str | None = None
    input_strategy: InputStrategy = "overlay_postman_values"
    title: str = ""
    description: str = ""
    rationale: str = ""


@dataclass
class MergePlan:
    decisions: list[MergeDecision] = field(default_factory=list)


@dataclass
class MergeDiff:
    updated: int = 0
    added: int = 0
    kept: int = 0
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "updated": self.updated,
            "added": self.added,
            "kept": self.kept,
            "notes": list(self.notes),
        }


@dataclass
class RulesPayload:
    service_code: str
    service_name: str
    rules: list[dict[str, Any]]

    def as_dict(self) -> dict[str, Any]:
        return {
            "service_code": self.service_code,
            "service_name": self.service_name,
            "rules": self.rules,
        }

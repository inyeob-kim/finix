"""Sequential rule engine for scenario intent steps."""

from __future__ import annotations

from app.domain.rules.base import ScenarioRule
from app.domain.scenario_intent import ScenarioIntentStep


class ScenarioRuleEngine:
    """Applies registered rules in insertion order."""

    def __init__(self) -> None:
        self._rules: list[ScenarioRule] = []

    def register_rule(self, rule: ScenarioRule) -> None:
        """Register one rule for future `apply_all` calls."""
        self._rules.append(rule)

    def apply_all(self, steps: list[ScenarioIntentStep]) -> list[ScenarioIntentStep]:
        """Apply all rules sequentially and return final steps."""
        current = list(steps)
        for rule in self._rules:
            current = rule.apply(current)
        return current


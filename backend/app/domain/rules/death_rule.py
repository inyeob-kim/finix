"""Domain rule: death registration requires inheritance close fallback."""

from __future__ import annotations

from app.domain.rules.base import ScenarioRule
from app.domain.scenario_intent import (
    EntityType,
    IntentType,
    ScenarioIntentStep,
    TestType,
)


class DeathInheritanceRule(ScenarioRule):
    """
    Ensure inheritance-close step exists after a negative account-close attempt.

    Idempotent by design: no duplicate insertion when the target step already exists.
    """

    @staticmethod
    def _reindex(steps: list[ScenarioIntentStep]) -> list[ScenarioIntentStep]:
        ordered = sorted(steps, key=lambda s: s.order)
        out: list[ScenarioIntentStep] = []
        for idx, step in enumerate(ordered, start=1):
            out.append(step.model_copy(update={"order": idx}))
        return out

    def apply(self, steps: list[ScenarioIntentStep]) -> list[ScenarioIntentStep]:
        if not steps:
            return steps
        has_death = any(s.intent_type == IntentType.CUSTOMER_DEATH_REGISTER for s in steps)
        if not has_death:
            return steps
        negatives = [
            s
            for s in steps
            if s.intent_type == IntentType.ACCOUNT_CLOSE and s.test_type == TestType.NEGATIVE
        ]
        if not negatives:
            return steps
        if any(s.intent_type == IntentType.ACCOUNT_INHERIT_CLOSE for s in steps):
            return self._reindex(steps)

        # Insert one alternative step right after the last negative close.
        base = max(negatives, key=lambda s: s.order)
        inserted = ScenarioIntentStep(
            step_id=f"{base.step_id}_inherit",
            order=base.order + 1,
            intent_type=IntentType.ACCOUNT_INHERIT_CLOSE,
            entity=EntityType.TERM_DEPOSIT,
            action="정기예금상속해지",
            context={"source_step_id": base.step_id},
            test_type=TestType.ALTERNATIVE,
        )
        out = list(steps) + [inserted]
        return self._reindex(out)


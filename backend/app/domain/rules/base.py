"""Rule abstraction for scenario intent steps."""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.domain.scenario_intent import ScenarioIntentStep


class ScenarioRule(ABC):
    """Base class for ordered rule evaluation."""

    @abstractmethod
    def apply(self, steps: list[ScenarioIntentStep]) -> list[ScenarioIntentStep]:
        """Return transformed step list."""
        raise NotImplementedError


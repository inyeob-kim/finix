"""Typed domain models for scenario intent pipeline."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, ConfigDict


class TestType(str, Enum):
    """Step testing mode used by rule engine and scenario projection."""

    POSITIVE = "POSITIVE"
    NEGATIVE = "NEGATIVE"
    ALTERNATIVE = "ALTERNATIVE"


class IntentType(str, Enum):
    """Supported high-level intent categories."""

    CUSTOMER_NEW = "CUSTOMER_NEW"
    ACCOUNT_OPEN = "ACCOUNT_OPEN"
    CUSTOMER_DEATH_REGISTER = "CUSTOMER_DEATH_REGISTER"
    ACCOUNT_CLOSE = "ACCOUNT_CLOSE"
    ACCOUNT_INHERIT_CLOSE = "ACCOUNT_INHERIT_CLOSE"
    GENERIC = "GENERIC"


class EntityType(str, Enum):
    """Business entities represented in intents."""

    CUSTOMER = "CUSTOMER"
    TERM_DEPOSIT = "TERM_DEPOSIT"
    ACCOUNT = "ACCOUNT"
    BENEFICIARY = "BENEFICIARY"
    GENERIC = "GENERIC"


class ScenarioIntentStep(BaseModel):
    """Step-level intent before service resolution."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    step_id: str = Field(..., min_length=1, max_length=64)
    order: int = Field(..., ge=1)
    intent_type: IntentType
    entity: EntityType
    action: str = Field(..., min_length=1, max_length=255)
    context: dict[str, Any]
    test_type: TestType


class ScenarioIntent(BaseModel):
    """Root intent object produced by LLM or deterministic fallback."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    scenario_id: str = Field(..., min_length=1, max_length=128)
    entities: list[str] = Field(default_factory=list)
    events: list[str] = Field(default_factory=list)
    primary_goal: str = Field(..., min_length=1, max_length=255)
    expected_error: str | None = None
    alternative_flow: str | None = None
    step_intents: list[ScenarioIntentStep] = Field(..., min_length=1)


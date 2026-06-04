"""Postman collection-level variables stored on scenario definition."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PostmanStartVarSpec(BaseModel):
    """User-defined variable available before the first request runs."""

    key: str = Field(..., min_length=1, max_length=128)
    value: str = ""
    description: str | None = Field(default=None, max_length=255)


class PostmanHeaderSpec(BaseModel):
    """Default HTTP header applied to every request in the exported collection."""

    key: str = Field(..., min_length=1, max_length=128)
    value: str = ""


def _default_header_specs() -> list[PostmanHeaderSpec]:
    from app.domain.postman_default_headers import default_postman_header_specs

    return default_postman_header_specs()


class PostmanCollectionConfig(BaseModel):
    """Scenario-level Postman export settings."""

    base_url: str = Field(default="", max_length=2048)
    start_vars: list[PostmanStartVarSpec] = Field(default_factory=list)
    default_headers: list[PostmanHeaderSpec] = Field(default_factory=_default_header_specs)

    def is_empty(self) -> bool:
        has_headers = any(h.key.strip() for h in self.default_headers)
        return (
            not self.base_url.strip()
            and not self.start_vars
            and not has_headers
        )

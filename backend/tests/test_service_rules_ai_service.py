import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import InvalidInputError
from app.services.service_rules_ai_service import (
    ServiceRulesAiService,
    _YAML_GENERATION_TEMPERATURE,
    _strip_fences,
)


def test_strip_fences_removes_markdown_wrapper():
    raw = "```yaml\nservice_code: X\nrules: []\n```"
    assert _strip_fences(raw).startswith("service_code:")


def test_generate_validated_yaml_retries_on_validation_failure():
    llm = MagicMock()
    llm.complete_text = AsyncMock(return_value="not valid yaml")
    rules = MagicMock()
    svc = ServiceRulesAiService(llm=llm, catalog_repo=MagicMock(), rules_service=rules)

    with pytest.raises(InvalidInputError):
        asyncio.run(
            svc._generate_validated_yaml_text(
                system_prompt="sys",
                user_prompt="user",
            )
        )

    assert llm.complete_text.await_count == 3
    calls = llm.complete_text.await_args_list
    assert calls[0].kwargs["temperature"] == _YAML_GENERATION_TEMPERATURE
    assert calls[0].kwargs.get("cache_system_prompt") is True
    assert "failed validation" in calls[1].kwargs["user_prompt"]


def test_generate_validated_yaml_returns_canonical_on_success():
    valid = """
service_code: PY016
service_name: Example
rules:
  - case_id: PY016-E-001
    rule_type: E
    title: t
    description: d
    input: {}
    expect:
      outcome: error
      http_status: 400
      error_code: E001
    assertions:
      - path: "$.error_code"
        op: equals
        value: E001
    tags: ["input"]
    source_evidence:
      method: validate
      snippet: "throw new BizApplicationException(\\"E001\\")"
  - case_id: PY016-N-001
    rule_type: N
    title: t
    description: d
    input: {}
    expect:
      outcome: success
      http_status: 200
      validation_target: transaction date is populated
    assertions:
      - path: "$.txDt"
        op: not_null
    tags: ["business"]
    source_evidence:
      method: buildOutput
      snippet: "out.setTxDt(...)"
"""
    llm = MagicMock()
    llm.complete_text = AsyncMock(return_value=valid)
    svc = ServiceRulesAiService(llm=llm, catalog_repo=MagicMock(), rules_service=MagicMock())

    out = asyncio.run(svc._generate_validated_yaml_text(system_prompt="s", user_prompt="u"))
    assert out.startswith("service_code: PY016")
    llm.complete_text.assert_awaited_once()
    assert llm.complete_text.await_args.kwargs["temperature"] == 0.1

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
    assert "failed schema validation" in calls[1].kwargs["user_prompt"]
    assert "VALIDATION ERROR" in calls[1].kwargs["user_prompt"]


def test_generate_validated_yaml_returns_canonical_on_success():
    valid = """
service_code: PY016
service_name: Example
rules:
  - case_id: PY016-E-001
    rule_type: E
    title: 고객 ID 누락 시 검증 오류를 반환한다
    description: 고객 ID가 없으면 대상을 식별할 수 없어 요청을 거절한다.
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
    title: 등록 목록은 제출 계좌마다 결과 행을 반환하여 대사할 수 있다
    description: 여러 대상 계좌를 제출하면 입력 행별로 결과를 맞춰볼 수 있도록 결과 목록을 반환한다.
    input: {}
    expect:
      outcome: success
      http_status: 200
      validation_target: 출력 목록 크기가 입력 목록과 일치한다
    assertions:
      - path: "$.resultList"
        op: not_null
    tags: ["business"]
    source_evidence:
      method: processRegList
      snippet: "for (RegItem item : in.getRegList()) { ... }"
"""
    llm = MagicMock()
    llm.complete_text = AsyncMock(return_value=valid)
    svc = ServiceRulesAiService(llm=llm, catalog_repo=MagicMock(), rules_service=MagicMock())

    out = asyncio.run(svc._generate_validated_yaml_text(system_prompt="s", user_prompt="u"))
    assert out.startswith("service_code: PY016")
    llm.complete_text.assert_awaited_once()
    assert llm.complete_text.await_args.kwargs["temperature"] == 0.1

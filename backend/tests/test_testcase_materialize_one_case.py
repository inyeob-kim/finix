"""Tests for per-case pool TC upsert (materialize_one_case)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.core.exceptions import EntityNotFoundError
from app.services.testcase_service import TestCaseService

_VALID_YAML = """
service_code: PY016
service_name: Example
rules:
  - case_id: PY016-N-001
    rule_type: N
    title: 정상 등록
    description: 필수 값이 모두 있으면 성공한다.
    input:
      custId: "C1"
    expect:
      outcome: success
      http_status: 200
      validation_target: response field is populated
    assertions:
      - path: "$.txDt"
        op: not_null
    tags: ["business"]
    source_evidence:
      method: execute
      snippet: "ok"
  - case_id: PY016-E-001
    rule_type: E
    title: 고객 ID 누락 시 검증 오류를 반환한다
    description: 고객 ID가 없으면 대상을 식별할 수 없어 요청을 거절한다.
    input:
      custId: null
    expect:
      outcome: error
      http_status: 400
      error_code: ERR001
    assertions:
      - path: "$.error_code"
        op: equals
        value: ERR001
    tags: ["input"]
    source_evidence:
      method: execute
      snippet: "throw"
"""


class _FakeRegistry:
    async def ensure_default_runner_stub(self) -> None:
        return None


class _FakeCbs:
    async def get_by_service_code(self, service_code: str):
        return SimpleNamespace(http_method="POST", uri=f"/api/{service_code}")


class _FakeTcRepo:
    """In-memory stand-in for FnxTestcaseRepository.upsert/get."""

    def __init__(self) -> None:
        self.rows: dict[tuple[str, str, str], SimpleNamespace] = {}

    async def get(self, *, inst_cd: str, svc_code: str, rule_case_id: str):
        return self.rows.get((inst_cd, svc_code, rule_case_id))

    async def upsert(
        self,
        *,
        inst_cd: str,
        svc_code: str,
        rule_case_id: str,
        **kwargs,
    ) -> tuple[SimpleNamespace, bool, bool]:
        key = (inst_cd, svc_code, rule_case_id)
        created = key not in self.rows
        row = self.rows.get(key)
        if row is None:
            row = SimpleNamespace(
                inst_cd=inst_cd, svc_code=svc_code, rule_case_id=rule_case_id, **kwargs
            )
        else:
            for k, v in kwargs.items():
                setattr(row, k, v)
        self.rows[key] = row
        return row, created, created or True


def _svc(tc_repo: _FakeTcRepo) -> TestCaseService:
    return TestCaseService(
        metadata_repo=None,  # type: ignore[arg-type]
        registry_repo=_FakeRegistry(),  # type: ignore[arg-type]
        cbs_catalog_repo=_FakeCbs(),  # type: ignore[arg-type]
        service_rules_repo=None,
        case_repo=None,
        tc_repo=tc_repo,  # type: ignore[arg-type]
    )


def test_materialize_one_case_creates_without_touching_others():
    tc_repo = _FakeTcRepo()
    other = SimpleNamespace(
        inst_cd="1001",
        svc_code="PY016",
        rule_case_id="PY016-E-001",
        name="other",
        request_body_json='{"keep":true}',
    )
    tc_repo.rows[("1001", "PY016", "PY016-E-001")] = other

    row, created, _bumped = asyncio.run(
        _svc(tc_repo).materialize_one_case(
            "PY016",
            "PY016-N-001",
            yaml_text=_VALID_YAML,
            inst_cd="1001",
        )
    )

    assert created is True
    assert row.rule_case_id == "PY016-N-001"
    assert row.svc_code == "PY016"
    assert row.expected_status == 200
    assert tc_repo.rows[("1001", "PY016", "PY016-E-001")] is other
    assert other.request_body_json == '{"keep":true}'


def test_materialize_one_case_updates_existing():
    tc_repo = _FakeTcRepo()
    existing = SimpleNamespace(
        inst_cd="1001",
        svc_code="PY016",
        rule_case_id="PY016-N-001",
        name="old",
        request_body_json="{}",
    )
    tc_repo.rows[("1001", "PY016", "PY016-N-001")] = existing

    row, created, _bumped = asyncio.run(
        _svc(tc_repo).materialize_one_case(
            "PY016",
            "PY016-N-001",
            yaml_text=_VALID_YAML,
            inst_cd="1001",
        )
    )

    assert created is False
    assert row is existing
    assert row.rule_case_id == "PY016-N-001"
    assert '"custId": "C1"' in row.request_body_json or (
        '"custId":"C1"' in row.request_body_json
    )


def test_materialize_one_case_missing_raises():
    tc_repo = _FakeTcRepo()
    with pytest.raises(EntityNotFoundError):
        asyncio.run(
            _svc(tc_repo).materialize_one_case(
                "PY016",
                "PY016-N-999",
                yaml_text=_VALID_YAML,
                inst_cd="1001",
            )
        )

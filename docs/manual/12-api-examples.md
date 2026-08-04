# API 요청·응답 예시

Base: `http://127.0.0.1:8000/api/v1`

## 시나리오 생성

**Request**

```http
POST /api/v1/scenarios
Content-Type: application/json

{
  "prompt": "PY027 AutoSweep 종료 후 검증 시나리오",
  "title": null
}
```

**Response** (요약)

```json
{
  "id": 12,
  "title": "PY027 AutoSweep ...",
  "prompt": "PY027 AutoSweep 종료 후 검증 시나리오",
  "steps": [
    {
      "id": "step-1",
      "number": 1,
      "action": "PY027 terminateAutoSweep",
      "result": "success",
      "service_code": "PY027"
    }
  ],
  "is_saved": false,
  "created_at": "2026-05-18T10:00:00Z"
}
```

---

## YAML 소스 AI 등록

**Request**

```http
POST /api/v1/service-rules/PY027/generate-draft-from-source
Content-Type: application/json

{
  "source_code": "public void validateArrId(String arrId) { ... }",
  "source_version": "branch-main",
  "hints": "AutoSweepTrmntnSvcIn arrId required",
  "created_by": "qa.editor"
}
```

**Response** (요약)

```json
{
  "id": 5,
  "service_code": "PY027",
  "status": "draft",
  "version": 1,
  "source_version": "branch-main",
  "yaml_text": "service_code: PY027\n...",
  "rules": { "rules": [ { "rule_id": "PY027-E-001", "...": "..." } ] }
}
```

---

## 작업본 적용

```http
POST /api/v1/service-rules/PY027/5/activate
```

`5`는 `service_rules_current.id`입니다. 작업본이 현재본으로 적용되고, 이전 적용본은 이력으로 보관됩니다.

```json
{
  "id": 5,
  "service_code": "PY027",
  "status": "active",
  "has_draft": false
}
```

---

## 테스트케이스 materialize

**Request**

```http
POST /api/v1/services/PY027/test-cases/materialize
Content-Type: application/json

{
  "instruction": "regression-2026-05",
  "replace_existing": true
}
```

**Response** (배열, 1건 예시)

```json
[
  {
    "id": 101,
    "scenario_id": null,
    "name": "PY027 PY027-E-001 The service rejects ... (regression-2026-05)",
    "method": "POST",
    "endpoint": "/PaymentAutoSweep/AutoSweep/Close",
    "request_body": { "arrId": null },
    "expected_status": 400,
    "expected_body": {
      "outcome": "error",
      "error_code": "AAPCME0006"
    },
    "step_index": 0,
    "created_at": "2026-05-18T10:05:00Z"
  }
]
```

**Error** (작업본만 있을 때)

```json
{
  "detail": "PY027: 작업본만 있고 적용된 규칙이 없습니다. 규칙/메타 관리에서 「적용」한 뒤 다시 「YAML에서 생성」을 실행하세요."
}
```

---

## 시나리오 TC 생성

```http
POST /api/v1/scenarios/12/test-cases/generate
Content-Type: application/json

{
  "instruction": null
}
```

---

## 실행 (Simulate)

**Request**

```http
POST /api/v1/executions
Content-Type: application/json

{
  "scenario_id": 12,
  "base_url": "",
  "mode": "simulate"
}
```

## 실행 (Live)

```http
POST /api/v1/executions
Content-Type: application/json

{
  "scenario_id": 12,
  "base_url": "http://3.35.90.196:8088",
  "mode": "live"
}
```

Live 시 시나리오 `postman.default_headers`(instCd, srvcCd 등)가 SUT로 전달됩니다.

**Response** (요약)

```json
{
  "id": 3,
  "scenario_id": 12,
  "base_url": "http://3.35.90.196:8088",
  "status": "completed",
  "summary": { "passed": 1, "failed": 2, "mode": "live" },
  "steps": [
    {
      "step_index": 0,
      "step_label": "[E] PY025-E-001 · ...",
      "testcase_id": 101,
      "status": "failed",
      "expected": { "status": 400, "body": { "outcome": "error" } },
      "actual": {
        "status": 500,
        "body": { "messageId": "AAPCME0072" },
        "resolved_request_body": { "brnchId": "001", "dt": "20260604" }
      },
      "error_message": "예상 HTTP 400, 실제 500"
    }
  ],
  "created_at": "2026-06-04T06:17:21Z"
}
```

---

## 실행 이력 목록

```http
GET /api/v1/executions?limit=20&offset=0&created_from=2026-06-01T00:00:00Z
```

```json
{
  "items": [
    {
      "id": 12,
      "scenario_id": 10,
      "base_url": "http://3.35.90.196:8088",
      "status": "completed",
      "summary": { "passed": 0, "failed": 5, "mode": "live" },
      "created_at": "2026-06-04T06:17:23Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

---

## save-definition (레지스트리 persist)

```http
POST /api/v1/scenarios/10/save-definition
Content-Type: application/json

{
  "title": "AutoSweep 센터컷 조회",
  "postman": {
    "base_url": "http://3.35.90.196:8088",
    "default_headers": [
      { "key": "srvcCd", "value": "PY025" },
      { "key": "instCd", "value": "1001" }
    ],
    "start_vars": [{ "key": "brnchId", "value": "001" }]
  },
  "per_step": [[101], [102]],
  "mark_saved": true
}
```

---

## resolve-preview

```http
POST /api/v1/scenarios/10/resolve-preview?simulate_responses=true
```

---

## 매뉴얼 RAG

```http
POST /api/v1/manual/chat
Content-Type: application/json

{
  "message": "YAML 등록하는 방법 알려줘",
  "history": []
}
```

```json
{
  "answer": "규칙/메타 관리(/rules)에서 ...",
  "sources": [
    {
      "header_path": "08-rules-yaml-registration > 방법 1 — 소스 붙여넣기 AI",
      "chunk_index": 42,
      "preview": "1. `/rules` 상단 **소스 붙여넣기**..."
    }
  ]
}
```

---

## 카탈로그 import

```http
POST /api/v1/service-catalog/import
```

```json
{
  "source": "cbs_srvc.json",
  "source_version": "sha256:abc...",
  "upserted": 982
}
```

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

## 번들 활성화

```http
POST /api/v1/service-rules/PY027/5/activate
```

```json
{
  "id": 5,
  "service_code": "PY027",
  "status": "active",
  "version": 1
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

**Error** (draft만 있을 때)

```json
{
  "detail": "PY027: YAML 규칙은 등록되어 있으나 Active 상태가 아닙니다. 현재 draft v1(#5, 규칙 3건). ..."
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

## 실행

**Request**

```http
POST /api/v1/executions
Content-Type: application/json

{
  "scenario_id": 12,
  "base_url": ""
}
```

**Response** (요약)

```json
{
  "id": 3,
  "scenario_id": 12,
  "status": "completed",
  "passed_count": 2,
  "failed_count": 0,
  "steps": [
    {
      "step_index": 0,
      "step_label": "PY027 ...",
      "testcase_id": 101,
      "status": "passed",
      "expected": { "status": 400, "body": { "...": "..." } },
      "actual": { "status": 400, "body": { "...": "..." } },
      "error_message": null
    }
  ]
}
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

# YAML 규칙 등록 (상세)

경로: **규칙/메타 관리** `/rules` (로그인 필요)

화면 버튼 전체 목록: `docs/manual/09-screen-reference.md` § 규칙/메타

---

## 번들 상태

| 상태 | TC materialize | 설명 |
|------|----------------|------|
| draft | **불가** | 편집 중 |
| approved | 불가 (기본) | 승인됨, 아직 Active 아님 |
| **active** | **가능** | 운영 규칙 |

materialize 400 시 메시지 예: 「YAML은 있으나 Active 상태가 아닙니다」→ **활성화** 클릭.

---

## 방법 1 — 소스 붙여넣기 AI (권장)

### UI 절차

1. `/rules` 상단 **소스 붙여넣기** 카드
2. **서비스** 콤보박스 선택 (예: PY027)
3. `source_version`, 힌트(선택), **소스 코드** 16자 이상
4. **생성 · DB 등록** — draft 생성
5. 하단 **서비스 목록**에서 해당 행 클릭
6. YAML·rule_id 검토
7. **활성화(Active)** — materialize 가능

### API

`POST /api/v1/service-rules/{code}/generate-draft-from-source`

```json
{
  "source_text": "... Java/CBS 소스 ...",
  "source_version": "1.0",
  "hint": "출금 한도 초과 에러 포함"
}
```

---

## 방법 2 — YAML 직접 편집

1. 목록에서 서비스 행 클릭
2. **YAML 편집** 탭
3. Monaco/textarea에서 수정
4. **저장(드래프트)** — `POST /service-rules/{code}`
5. **활성화**

파일 fallback: `backend/app/rules_yaml/{code}.yaml` (DB Active 없을 때만)

---

## 방법 3 — 메타 AI (API)

`POST /api/v1/service-rules/{code}/generate-draft`

카탈로그 메타만으로 초안 — 소스 없을 때.

---

## 활성화 후 체크리스트

- [ ] `/rules` 목록에 **Active** 배지
- [ ] `GET /rules-yaml/{code}` 200
- [ ] `/test-cases` → **YAML에서 생성** 성공
- [ ] TC 행 ▶ 로 request/expected JSON 확인

---

## 검증·롤백·삭제

| 동작 | API / UI |
|------|----------|
| YAML 검증 | **validate** 버튼 → `POST .../validate-yaml` |
| 승인 | `POST .../{id}/approve` |
| 활성화 | `POST .../{id}/activate` |
| 롤백 | `POST .../rollback` |
| 번들 삭제 | 휴지통 → `DELETE .../bundles/{id}` |

Active 번들 삭제 시 해당 서비스 materialize **불가** until 새 Active.

---

## YAML 필수 구조

```yaml
service_code: PY027
rules:
  - rule_id: ERR_LIMIT_EXCEED
    rule_type: error
    description: 한도 초과
    expect:
      http_status: 400
    minimal_input:
      amount: 1000000
    assertions:
      - path: $.errorCode
        equals: "E001"
```

| 필드 | 필수 |
|------|------|
| `service_code` | ● |
| `rules[]` | ● |
| `rule_id`, `rule_type`, `description`, `expect`, `minimal_input` | 규칙당 ● |
| `rule_type` | `error` \| `business` \| `code` |
| `assertions` | error/business 권장 |
| `source_evidence` | 소스 AI 생성 시 포함 |

---

## PY027 전체 예시

`docs/manual/10-e2e-walkthrough-py027.md` — 카탈로그 → YAML → TC → 시나리오 → 실행.

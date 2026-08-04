# YAML 규칙 등록 (상세)

경로: **규칙/메타 관리** `/rules` (로그인 필요)

화면 버튼 전체 목록: `docs/manual/09-screen-reference.md` § 규칙/메타

---

## 현재본 · 작업본 · 이력

| 구분 | TC materialize | 설명 |
|------|----------------|------|
| **작업본 (draft)** | **불가** | 편집·AI 생성 결과. 아직 미적용 |
| **적용됨 (current)** | **가능** | 서비스당 1개의 현재 규칙 |
| **이력 (history)** | 불가 | 적용/복원 전 스냅샷. 복원 가능 |

materialize 400 시 메시지 예: 「작업본만 있고 적용된 규칙이 없습니다」→ **적용** 클릭.

버전 번호(v12)는 UI에 노출하지 않습니다. 이력은 일시·변경 종류로 구분합니다.

---

## 방법 1 — 소스 붙여넣기 AI (권장)

### UI 절차

1. `/rules` 상단 **소스 붙여넣기** 카드
2. **서비스** 콤보박스 선택 (예: PY027)
3. `source_version`, 힌트(선택), **소스 코드** 16자 이상
4. **생성 · DB 등록** — 작업본 저장
5. 하단 **서비스 목록**에서 해당 행 클릭
6. YAML·case_id 검토
7. **적용** — materialize 가능

### API

`POST /api/v1/service-rules/{code}/generate-draft-from-source`

```json
{
  "source_code": "... Java/CBS 소스 ...",
  "source_version": "1.0",
  "hints": "출금 한도 초과 에러 포함"
}
```

---

## 방법 2 — YAML 직접 편집

1. 목록에서 서비스 행 클릭
2. **YAML 편집** 탭
3. Monaco/textarea에서 수정
4. **저장** — 작업본 upsert (`POST`/`PUT /service-rules/...`)
5. **적용** — 현재본 갱신 + 이전 적용본은 이력으로 보관

파일 fallback: `backend/app/rules_yaml/{code}.yaml` (DB 적용본 없을 때만)

---

## 방법 3 — 메타 AI (API)

`POST /api/v1/service-rules/{code}/generate-draft`

카탈로그 메타만으로 작업본 — 소스 없을 때.

---

## 적용 후 체크리스트

- [ ] `/rules` 목록에 **적용됨** 배지
- [ ] `GET /rules-yaml/{code}` 200
- [ ] `/test-cases` → **YAML에서 생성** 성공
- [ ] TC 행 ▶ 로 request/expected JSON 확인

---

## 검증·복원·삭제

| 동작 | API / UI |
|------|----------|
| YAML 검증 | **validate** 버튼 → `POST .../validate-yaml` |
| 적용 | `POST .../{id}/activate` (작업본 → 현재본) |
| 이력 복원 | `POST .../rollback` body `{ "to_version": <history_id> }` |
| 이력 삭제 | 휴지통 → `DELETE .../bundles/{id}` (`id` = history_id) |

적용된 현재본이 없으면 해당 서비스 materialize **불가**.

---

## YAML 필수 구조

```yaml
service_code: PY027
rules:
  - case_id: PY027-E-001
    rule_type: E
    description: 한도 초과
    expect:
      http_status: 400
      outcome: error
      error_code: E001
    input:
      amount: 1000000
    assertions:
      - path: $.error_code
        equals: "E001"
```

| 필드 | 필수 |
|------|------|
| `service_code` | ● |
| `rules[]` | ● |
| `case_id`, `rule_type`, `description`, `expect`, `input` | 규칙당 ● |
| `rule_type` | `E` \| `N` |
| `assertions` | E/N 권장 |
| `source_evidence` | 소스 AI 생성 시 포함 |

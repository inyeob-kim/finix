# 테스트케이스와 실행

## 테스트케이스 관리 (`/test-cases`)

로그인 필요. **서비스별 TC 풀** 관리 (`scenario_id == null`).

### 화면 필드

| UI | 설명 |
|----|------|
| 서비스 | ServiceCatalogCombobox, 최대 50건 검색 |
| 생성 메모 | TC 이름 뒤 `(메모)` suffix |
| 기존 풀 삭제 후 재생성 | materialize 전 삭제 |
| YAML에서 생성 | Primary |
| 목록 새로고침 | GET list |
| 테이블 | ID, 이름, 시나리오, 메서드, 엔드포인트, 이동 |

### 절차: YAML → TC 풀

1. `/rules`에서 해당 서비스 **Active** 확인
2. `/test-cases` → 서비스 선택
3. **YAML에서 생성**
4. 행 **▶** 클릭 → Input(`request_body`) / Output(`expected_status`, `expected_body`)

### materialize API

`POST /api/v1/services/{code}/test-cases/materialize`

| 필드 | 기본 |
|------|------|
| replace_existing | true |
| instruction | null |

### 오류

| 메시지 | 원인 |
|--------|------|
| Active 상태가 아닙니다 | draft만 있음 → `/rules` 활성화 |
| 규칙이 없습니다 | YAML 미등록 |

---

## 테스트케이스 화면 (`/test-case/:scenarioId`)

### 레이아웃

| 영역 | 내용 |
|------|------|
| 좌측 | TC 목록 (이름, 선택) |
| 우측 | API 요청 + 예상 결과 |
| 하단 | 포스트맨, 테스트 실행, 뒤로 |

### TC 없을 때

- `GET /rules-yaml/{code}` 미리보기
- 규칙 ID 목록·RAW YAML
- **테스트케이스 생성**

### TC 있을 때

| 버튼 | API |
|------|-----|
| 포스트맨으로보내기 | GET `.../export/postman` |
| 테스트 실행 | POST `/executions` |

### registry 모드 (`/test-case` only)

`ScenarioRegistry` Wand에서 진입 — state.registry 전달.

---

## 실행 파이프라인

```mermaid
flowchart LR
  A[테스트 실행 클릭] --> B[POST /executions]
  B --> C[각 TC 순회]
  C --> D[simulate_response]
  D --> E[execution_step_results 저장]
  E --> F[/execution-result/id]
```

### 중요: 시뮬레이터

- **실제 CBS HTTP 호출 아님**
- `expected_body` 기반 stub 응답 생성
- `base_url` 비어 있으면 내부 stub만

### 실행 결과 (`/execution-result/:executionId`)

| UI | 설명 |
|----|------|
| 요약 | total, passed, failed |
| 스텝 | label, status badge |
| 펼치기 | expected JSON vs actual JSON |
| error_message | failed 시 |

`GET /api/v1/executions/{id}`

---

## 테스트 이력 (`/history`)

| 항목 | 현재 상태 |
|------|-----------|
| 데이터 | **MOCK_HISTORY** 고정 |
| API | `GET /executions` **미연동** |
| 탭 | 시나리오 실행만 활성 |

### 권장

실행 후 redirect URL `/execution-result/{id}` 를 북마크. History는 참고 UI만.

### 향후 연동 시

`listExecutions` API → 테이블 바인딩 예정.

---

## Postman export

1. TC 선택
2. **포스트맨으로보내기**
3. Collection JSON 다운로드
4. Postman Import

수동 SUT 테스트에 활용.

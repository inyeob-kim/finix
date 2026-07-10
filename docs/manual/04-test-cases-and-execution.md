# 테스트케이스와 실행

## 테스트케이스 관리 (`/test-cases` → `/rules` 통합)

로그인 필요. 사이드바 **「테스트케이스 관리」**는 `/rules`(규칙/메타 관리)로 리다이렉트됩니다. 서비스별 **TC 풀**(`scenario_id == null`)은 규칙 화면에서 서비스를 선택한 뒤 materialize 합니다.

### 화면 필드 (규칙/메타 내 TC 패널)

| UI | 설명 |
|----|------|
| 서비스 | ServiceCatalogCombobox, 검색 |
| 생성 메모 | TC 이름 뒤 `(메모)` suffix |
| 기존 풀 삭제 후 재생성 | materialize 전 삭제 |
| YAML에서 생성 | Active 규칙 → TC 풀 적재 |
| 목록 | ID, 이름, 메서드, 엔드포인트 |

### 절차: YAML → TC 풀

1. `/rules`에서 해당 서비스 **Active** 확인
2. 서비스 선택 → **YAML에서 생성**
3. 행 펼치기 → `request_body` / `expected_status` / `expected_body` 확인

### materialize API

`POST /api/v1/services/{code}/test-cases/materialize`

| 필드 | 기본 |
|------|------|
| replace_existing | true |
| instruction | null |

### 오류

| 메시지 | 원인 |
|--------|------|
| Active 상태가 아닙니다 | draft만 있음 → **활성화** |
| 규칙이 없습니다 | YAML 미등록 |

---

## 테스트케이스 화면 (`/test-case/:scenarioId`)

### 레이아웃

| 영역 | 내용 |
|------|------|
| 좌측 | TC 목록 |
| 우측 | API 요청 + 예상 결과 |
| 하단 | 포스트맨, **테스트 실행**, 뒤로 |

### 테스트 실행 다이얼로그

| 필드 | 설명 |
|------|------|
| baseUrl | Live 모드 시 **필수** (예: `http://host:8088`) |
| 실행 모드 | **Simulate**(기본) 또는 **Live** |

### TC 없을 때

- `GET /rules-yaml/{code}` 미리보기
- **테스트케이스 생성** (`POST .../test-cases/generate`)

### TC 있을 때

| 버튼 | API / 동작 |
|------|------------|
| 포스트맨으로보내기 | `GET /scenarios/{id}/export/postman` 또는 TC 단건 export |
| 테스트 실행 | `POST /executions` → `/execution-result/{id}` |

### registry 모드

`ScenarioRegistry` Wand 또는 마법사에서 `/test-case` 진입 — `state.registry` 전달.

---

## 실행 파이프라인

```mermaid
flowchart TD
  A[테스트 실행] --> B{mode}
  B -->|simulate| C[resolve_scenario_run + stub]
  B -->|live| D[resolve + httpx HTTP]
  C --> E[execution_step_results]
  D --> E
  E --> F[/execution-result/id]
```

### Simulate (기본)

- **실제 CBS HTTP 호출 없음**
- `simulate_response`: `expected_body`·엔드포인트 힌트 기반 stub
- inject/extract 바인딩은 stub 응답으로 체인 연습 가능
- `base_url`은 기록용(비어 있어도 실행 가능)

### Live

- `mode: "live"` + **baseUrl 필수**
- 스텝마다 `resolved_request_body`로 **실제 HTTP** (`httpx`)
- 시나리오 `steps_json`의 **Postman 설정**(`postman.default_headers`, `start_vars`) 적용
- CBS가 4xx/5xx를 주면 그대로 **actual**에 기록 → 기대 status와 다르면 **failed**

### 공통: 바인딩·컨텍스트

1. `steps_json`의 logical step별 **inject / extract / override**
2. `start_vars` → 초기 runtime context
3. 이전 스텝 응답에서 extract → 다음 스텝 inject

미리보기: `POST /scenarios/{id}/resolve-preview?simulate_responses=true`

---

## 실행 API

```http
POST /api/v1/executions
Content-Type: application/json

{
  "scenario_id": 12,
  "base_url": "http://3.35.90.196:8088",
  "mode": "live"
}
```

| 필드 | 설명 |
|------|------|
| scenario_id | DB 시나리오 ID |
| base_url | SUT 루트 (Live 필수) |
| mode | `simulate` \| `live` |

`summary` 예: `{ "passed": 2, "failed": 1, "mode": "live" }`

---

## 실행 결과 (`/execution-result/:executionId`)

| UI | 설명 |
|----|------|
| 뒤로 | `location.state.from` 또는 시나리오 레지스트리 |
| 요약 | passed / failed, 실행 시각, 시나리오 제목 |
| 타임라인 툴바 | 실패만, 전체 펼치기/접기 |
| 스텝 카드 | method, endpoint, request URL, status |
| JSON | expected vs actual, **변경 필드만** 하이라이트 |
| context | 스텝 후 runtime context (Live/Simulate) |

`GET /api/v1/executions/{id}` — `actual`에 `resolved_request_body`, `template_request_body` 포함.

---

## 배치 실행 결과 (`/execution-batch?ids=1,2,3`)

**시나리오 레지스트리**에서 컬렉션 **전체 실행** 후 이동합니다.

| 영역 | 설명 |
|------|------|
| 상단 요약 | 컬렉션명, 시나리오 수, 스텝 성공/실패, 첫 실패로 이동 |
| 좌측 | 시나리오별 실행 목록 (각각 독립 `POST /executions`) |
| 우측 | 선택 시나리오의 타임라인 (`ExecutionTimelinePanel`) |
| 단일 결과 화면 | `/execution-result/{id}` (뒤로 시 배치 URL 복귀) |

- URL의 `ids`는 쉼표 구분 execution ID
- `location.state.batchMeta`에 컬렉션명·스킵 건수·오류 메시지 (새로고침 시 API만으로 재조회)

---

## 테스트 이력 (`/history`)

| 항목 | 상태 |
|------|------|
| 데이터 | **`GET /api/v1/executions`** 실데이터 |
| 필터 | 최근 7일(기본), 오늘, 30일, 전체, 사용자 지정 기간 |
| 행 클릭 | `/execution-result/{id}` |
| 시나리오 링크 | `scenario_id` 있으면 `/test-case/{id}` |

쿼리: `created_from`, `created_to`, `limit`, `offset`

---

## Postman export

### 시나리오 단건·컬렉션 (레지스트리)

1. DB에 시나리오 동기화(`save-definition` / 실행·export 시 자동 persist)
2. **Postman보내기** — baseUrl, 기본 헤더, collection 변수, 파일명
3. `resolved=true`, `native=true` 시 `{{var}}`·test 스크립트(extract) 포함

API: `GET /api/v1/scenarios/{id}/export/postman`

### FCC 기본 헤더 (Live·export 공통)

| 헤더 | 기본값 | 비고 |
|------|--------|------|
| Content-Type | application/json | |
| instCd | 1001 | 환경에 맞게 수정 |
| deptId | 10001 | |
| txDt | 오늘 YYYYMMDD | 실행 시 갱신 |
| staffId | 1000013 | |
| srvcCd | *(빈 값)* | **Live 시 PY025 등 서비스 코드 권장** |
| scrnId | *(빈 값)* | 채널 화면 ID |

CBS `preHandle`에서 `AAPCME0072` 등 500이 나면 Postman 성공 요청과 헤더를 비교하세요.

---

## Live 실행 FAQ

### FINIX가 500을 냈나요?

아니요. **SUT(CBS)**가 500을 반환한 것이고, FINIX는 그 결과를 타임라인에 표시합니다. 백엔드 `POST /executions`는 보통 200입니다.

### Simulate는 통과하는데 Live만 실패

- 헤더(`srvcCd`, `instCd` 등)·baseUrl·요청 body가 SUT와 다른 경우가 대부분입니다.
- negative TC는 **기대 HTTP 400**인데 SUT가 **500**을 주면 failed가 정상입니다.

### 어디서 Live를 켜나요?

- `/test-case/:scenarioId` — 테스트 실행 다이얼로그
- `/scenario-registry` — 행 ▶ 또는 컬렉션 **전체 실행**

자세한 채널·바인딩: `docs/manual/14-scenario-bindings-and-postman.md`

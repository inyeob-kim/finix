# 시나리오 관리 (레지스트리)

경로: `/scenario-registry` (로그인 필요)

브라우저 **localStorage** 워크스페이스 + **실행·Postman export 시 DB 동기화** 하이브리드입니다.

## 저장소 모델

| 계층 | 저장 위치 | 용도 |
|------|-----------|------|
| 레지스트리 UI | `localStorage` (v2) | 폴더, 메타, 스텝, Postman 설정, 바인딩 |
| 실행·export | DB `scenarios` + `testcases` | `save-definition`, persist 후 `POST /executions` |

- **Export/Import JSON**: 팀 공유·백업 (localStorage 스냅샷)
- **▶ 실행 / Postman**: 레지스트리 항목을 `persistRegistryScenarioToDb` → `POST /scenarios/{id}/save-definition` 후 API 호출
- 홈 AI(`/`)로 만든 DB 시나리오와 **자동 병합되지 않음**

## 화면 레이아웃

| 영역 | 설명 |
|------|------|
| 상단 툴바 | Export, Import, 폴더+, 검색, 필터, **등록** |
| 좌측 | 폴더 트리 (컬렉션) |
| 중앙 | 시나리오 테이블 |
| 우측 (선택) | 미리보기·연결·실행 값 패널 |
| 메트릭 | Total, AI %, Success %, Coverage % |

## Export / Import

### Export

1. **Export** → JSON Dialog
2. 파일 저장 → Git/공유폴더

### Import

1. **Import** → JSON 붙여넣기
2. **저장** — 기존 localStorage **덮어쓰기** 주의

## 폴더(컬렉션)

1. **폴더+** 새 컬렉션
2. 폴더 선택 → 해당 시나리오만 표시
3. **전체 실행** — 컬렉션 내 export 가능한 시나리오를 순차 Live/Simulate 실행 → `/execution-batch?ids=...`

## 시나리오 등록 마법사

**등록** 또는 행 **편집**.

### 1단계 — 서비스 시퀀스

| UI | 설명 |
|----|------|
| 서비스 검색·추가 | 카탈로그 |
| DnD | 순서 변경 |
| **연결 마법사** | 스텝 간 inject/extract 제안 (카탈로그 I/O 기반) |
| AI 연결 제안 | `POST /scenarios/suggest-bindings` (선택) |

### 2단계 — 메타·TC·Postman

| 필드 | 설명 |
|------|------|
| 시나리오명 | 필수 |
| 설명·태그 | 선택 |
| 서비스별 TC pick | 풀 TC / 규칙 참조 |
| Postman 설정 | baseUrl, **기본 헤더**, 시작 변수, collection 변수 |
| 실행 값 미리보기 | `resolve-preview` |

**저장** → localStorage + (백엔드 연동 시) `save-definition`으로 DB 반영 가능.

## 목록 행 액션

| 버튼 | 동작 |
|------|------|
| 행 클릭 | 미리보기·바인딩·실행 값 |
| Wand2 | `/test-case` registry 모드 |
| ▶ | 단일 시나리오 실행 (baseUrl + Simulate/Live) |
| Postman | Collection JSON/ZIP (컬렉션 단위 ZIP 가능) |
| 편집 | 마법사 |
| 삭제 | Confirm |

## 실행 (단건·컬렉션)

### 단건 ▶

1. 다이얼로그: **baseUrl**, **Simulate / Live**
2. Live + baseUrl 필수
3. persist → `POST /executions` → `/execution-result/{id}`

### 컬렉션 전체 실행

1. 컬렉션 선택 → **전체 실행**
2. 동일 baseUrl·모드로 시나리오별 순차 실행 (각각 별도 execution ID)
3. 완료 후 **`/execution-batch?ids=1,2,3`** — 좌측 목록 + 우측 타임라인

## Postman보내기

- 시나리오·컬렉션 단위
- `GET /scenarios/{id}/export/postman?resolved=true&native=true`
- 바인딩·변수는 `steps_json`의 `postman` 블록과 auto-bindings 반영

## DB 시나리오와의 관계

| 출처 | 실행 ID | 레지스트리 표시 |
|------|---------|-----------------|
| 홈 AI | `scenarios.id` | 수동 Import 전까지 없음 |
| 레지스트리 ▶ | persist 후 동일 | `backendScenarioId` 저장 |

실행 이력(`/history`)은 **DB execution id** 기준입니다.

## FAQ

### 레지스트리만 팀과 공유?

Export JSON → Import. DB 공유는 별도 DB 백업 또는 동일 시나리오를 홈/DB로 재생성.

### Coverage %?

UI 추정 메트릭. 서비스 시퀀스 대비 규칙/TC 커버리지.

### Live 500 (AAPCME0072)?

SUT 채널 헤더 문제. `srvcCd`·`instCd`를 Postman과 맞추세요. → `04-test-cases-and-execution.md` Live FAQ.

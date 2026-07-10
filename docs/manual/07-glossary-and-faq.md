# 용어집과 FAQ

## 용어

| 용어 | 설명 |
|------|------|
| SRVC_CD / service_code | CBS 서비스 코드 (예: PY025, PY027) |
| 규칙 번들 | 한 서비스의 YAML 규칙 묶음 (버전별) |
| draft | 초안. TC materialize 불가 |
| active | 운영 반영 규칙. TC 생성에 사용 |
| TC 풀 | `scenario_id` null 테스트케이스 |
| materialize | YAML 규칙 → TC DB 적재 |
| 레지스트리 | localStorage 시나리오 워크스페이스 (+ 실행 시 DB persist) |
| Simulate | stub 응답으로 체인·검증 (실 HTTP 없음) |
| Live | httpx로 SUT 실제 호출 |
| inject / extract | 스텝 간 요청·응답 데이터 연결 |
| 배치 실행 | 컬렉션 전체 실행 → `/execution-batch?ids=` |

## 자주 묻는 질문

### YAML 등록은 어디서 하나요?

**규칙/메타 관리** (`/rules`). **소스 붙여넣기** 또는 **YAML 편집** 탭. `FINIX_MANUAL.md` 「YAML 규칙 등록 방법」.

### 등록했는데 테스트케이스 생성 실패

번들이 **draft**이면 실패. **활성화(Active)** 후 materialize.

### AI 시나리오와 레지스트리 차이

- **홈 `/`**: DB `scenarios` 생성
- **시나리오 관리**: localStorage + Export/Import; 실행 시 DB 동기화

### 테스트 이력은 Mock인가요?

**아니요.** `/history`는 `GET /executions` 실데이터. 기간 필터·행 클릭으로 결과 화면 이동.

### 매뉴얼 챗이 모른다고 답함

1. `docs/manual/*.md`, `FINIX_MANUAL.md` 갱신
2. `python backend/scripts/reindex_manual.py` 또는 `POST /manual/reindex`
3. 질문에 메뉴 경로 포함 (예: 「/scenario-registry Live 실행」)

### 실행이 실 API를 호출하나요?

- **Simulate**(기본): 호출 안 함
- **Live**: `mode: "live"` + baseUrl → CBS 등 SUT로 HTTP

### Live만 500 (AAPCME0072)이 나옵니다

SUT 채널 검증 실패입니다. `srvcCd`, `instCd`, `scrnId`를 Postman 성공 케이스와 맞추세요. `14-scenario-bindings-and-postman.md` 참고.

### Postman export는 어디서?

- `/test-case/:scenarioId` — 단건
- `/scenario-registry` — 시나리오·컬렉션 ZIP
- API: `GET /scenarios/{id}/export/postman`

### 컬렉션 전체 실행 결과는 어디서 보나요?

`/execution-batch?ids=1,2,3` — 좌측 시나리오 목록, 우측 타임라인.

### LLM 없이 쓸 수 있나?

| 기능 | LLM |
|------|-----|
| 시나리오 생성 | fallback 가능 (품질 제한) |
| YAML AI·바인딩 AI·매뉴얼 RAG | 키 필요 |
| TC materialize·Simulate 실행 | 불필요 |
| Live 실행 | 불필요 (SUT만 필요) |

## 알려진 제한

- 백엔드 API 무인증 (UI 로그인은 Mock)
- Live 시 **스텝별 srvcCd 자동 설정 없음** — Postman 기본 헤더에 수동 설정
- `/test-cases` 경로는 `/rules`로 리다이렉트
- 배치 URL 새로고침 시 컬렉션명 등 일부 메타는 `state` 없으면 생략
- 카탈로그 import는 API만 (전용 UI 없음)

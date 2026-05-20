# 화면별 UI 참조 (버튼·필드)

모든 경로는 로그인 후 접근 가능 여부를 괄호에 표기합니다.

## 공통: 사이드바 (`Root`)

| UI | 동작 |
|----|------|
| FINIX 로고 | — |
| AI 시나리오 생성 | `/` |
| 시나리오 관리 | `/scenario-registry` (로그인) |
| 테스트케이스 관리 | `/test-cases` (로그인) |
| 규칙/메타 관리 | `/rules` (로그인) |
| 테스트 이력 | `/history` (로그인) |
| 매뉴얼 | `/manual` (로그인) |
| 접기 | 사이드바 축소 |
| 사용자 영역 | 게스트 / 로그인 사용자명·역할 |
| 로그아웃 / 로그인 | `/login` 이동 |

---

## 로그인 (`/login`)

| 필드/버튼 | 설명 |
|-----------|------|
| 사용자 ID | 임의 문자열 (Mock) |
| 비밀번호 | 표시 토글 가능 |
| 역할 | `qa.editor` / `qa.approver` |
| 센터 ID | 선택 |
| 언어 | 선택 |
| 로그인 | `finix.auth` localStorage 저장 후 `from` 경로 복귀 |

---

## AI 시나리오 생성 (`/`)

| UI | 설명 |
|----|------|
| 생성 프롬프트 | textarea, ⌘/Ctrl+Enter 생성 |
| 고급 옵션 | 펼치기 → 규칙 Active/Draft (UI만) |
| 추천 칩 | 예시 프롬프트 입력 |
| 시나리오 생성 | `POST /api/v1/scenarios` → `/scenario/:id` |

---

## 시나리오 편집 (`/scenario/:scenarioId`)

| UI | 설명 |
|----|------|
| 스텝 카드 | 드래그 핸들로 순서 변경 |
| 스텝 삭제 | 개별 제거 |
| 단계 추가 | 새 action 스텝 |
| 테스트 케이스 생성 | PATCH 저장 + TC generate → `/test-case/:id` |

---

## 시나리오 관리 (`/scenario-registry`) (로그인)

### 상단 툴바

| 버튼 | 설명 |
|------|------|
| Export | localStorage 레지스트리 JSON보내기 |
| Import | JSON 붙여넣기 복원 |
| 폴더+ / 폴더 추가 | 컬렉션 생성 |
| 검색 | 시나리오명·태그 필터 |
| 상태 필터 | draft / active / archived 등 |
| 태그 필터 | 쉼표 구분 |
| 등록 | 2단계 시나리오 등록 마법사 열기 |

### 좌측 폴더 트리

| UI | 설명 |
|----|------|
| 폴더 선택 | 해당 컬렉션 시나리오만 표시 |
| 폴더 편집/삭제 | 이름 변경, 삭제 확인 |

### 시나리오 테이블 행

| 아이콘/버튼 | 설명 |
|-------------|------|
| 미리보기 패널 | 우측 Resizable 패널 |
| Wand2 | 테스트케이스 생성 → `/test-case` (registry) |
| Play / View Report | `/history` (Mock 연동) |
| 편집 | 등록 마법사 재진입 |
| 삭제 | ConfirmPopover |

### 시나리오 등록 마법사 (Dialog)

**1단계 — 서비스 시퀀스**

| UI | 설명 |
|----|------|
| 서비스 검색·추가 | 카탈로그에서 스텝 추가 |
| DnD | 순서 변경 |
| 다음 | 2단계 |

**2단계 — 메타·TC**

| UI | 설명 |
|----|------|
| 시나리오명·설명·태그 | 메타 입력 |
| 서비스별 규칙 TC pick | 풀 TC 또는 규칙 참조 선택 |
| 저장 | localStorage persist |

### 메트릭 카드 (상단)

Total Scenarios, AI Generated %, Success %, Coverage % — UI 계산값.

---

## 규칙/메타 관리 (`/rules`) (로그인)

### 상단

| UI | 설명 |
|----|------|
| YAML 등록 (소스 기반 AI) 카드 | 설명 + **소스 붙여넣기** |
| 카탈로그 스냅샷 | 활성/초안 건수 |
| 정렬 / 상태 / 소스 버전 필터 | 목록 필터 |
| 새로고침 | registry reload |
| 검색 | 서비스 코드·이름 |

### 목록 행

| 버튼 | 설명 |
|------|------|
| 편집 | 상세 Dialog |
| 삭제 (휴지통) | bundle DELETE |

### 상세 Dialog

| 탭/버튼 | 설명 |
|---------|------|
| 메타 요약 | 코드, 이름, 규칙 수, 수정자 |
| YAML 편집 | textarea |
| 저장(드래프트) | POST draft |
| Export | YAML 파일 다운로드 |
| 승인 | approve |
| 활성화 | **Active** — TC materialize 필수 |
| 닫기 | — |

### 소스 AI 모달

서비스, source_version, 힌트, 소스 코드 → **생성 · DB 등록** → 완료 Dialog.

---

## 테스트케이스 관리 (`/test-cases`) (로그인)

| UI | 설명 |
|----|------|
| 서비스 콤보박스 | 검색·선택 |
| 생성 메모 | TC 이름 suffix |
| 기존 풀 삭제 후 재생성 | checkbox |
| YAML에서 생성 | materialize |
| 목록 새로고침 | GET list |
| 행 ▶ | Input/Output JSON |
| 열기 | `/test-case/:scenarioId` (연결된 경우) |

---

## 테스트케이스 (`/test-case/:scenarioId`)

| UI | 설명 |
|----|------|
| TC 목록 (좌) | 선택 |
| API 요청 / 예상 결과 | JSON pre |
| 테스트케이스 생성 | generate |
| 포스트맨으로보내기 | export postman |
| 테스트 실행 | POST executions |
| 뒤로 | 이전 화면 |

---

## 실행 결과 (`/execution-result/:executionId`)

| UI | 설명 |
|----|------|
| 요약 카드 | 전체/성공/실패 |
| 스텝 아코디언 | expected vs actual |

---

## 테스트 이력 (`/history`) (로그인)

| UI | 설명 |
|----|------|
| 탭 | 시나리오 실행 이력 (활성), API/업무/에러 로그 (준비) |
| 날짜·시간 | 필터 |
| 조회 | Mock 데이터 갱신 |
| 검색 | — |
| 상세 | `/execution-result/:id` (ID 불일치 주의) |

---

## 매뉴얼 (`/manual`) (로그인)

| UI | 설명 |
|----|------|
| 추천 질문 칩 | 빠른 질문 |
| 채팅 말풍선 | user/assistant |
| 참고 섹션 | RAG source headers |
| 입력창 | Enter 전송, Shift+Enter 줄바꿈 |
| 전송 | POST /manual/chat |
| 하단 상태 | 인덱스 chunk 수 |

# FINIX 테스트 자동화 플랫폼 매뉴얼

FINIX(Finance Intelligence eXecution)는 CBS 서비스 카탈로그, YAML 규칙, 시나리오, HTTP 테스트케이스, 실행 이력을 하나의 흐름으로 연결하는 **금융 API 테스트 자동화** 웹 애플리케이션입니다.

## 매뉴얼 문서 구조 (RAG 인덱스)

매뉴얼 챗은 이 파일과 `docs/manual/*.md` 챕터를 **헤더 단위로 chunking·embedding**합니다.

| 챕터 파일 | 주제 |
|-----------|------|
| `docs/manual/01-getting-started.md` | 로그인, 로컬 실행, DB vs 레지스트리 |
| `docs/manual/02-scenario-ai-flow.md` | 홈 AI 시나리오, `/scenario/:id` |
| `docs/manual/03-scenario-registry.md` | 시나리오 관리 localStorage |
| `docs/manual/04-test-cases-and-execution.md` | TC 풀, 실행, 결과 화면 |
| `docs/manual/05-service-catalog.md` | 카탈로그 import API |
| `docs/manual/06-api-reference.md` | REST API 전체 목록 |
| `docs/manual/07-glossary-and-faq.md` | 용어, FAQ, 알려진 제한 |
| `docs/manual/08-rules-yaml-registration.md` | YAML 등록·활성화 상세 |
| `docs/manual/09-screen-reference.md` | 전 화면 버튼·필드 참조 |
| `docs/manual/10-e2e-walkthrough-py027.md` | PY027 E2E 워크스루 |
| `docs/manual/11-role-guides.md` | QA / 규칙작성 / 운영 역할별 |
| `docs/manual/12-api-examples.md` | REST 요청·응답 JSON 예시 |
| `docs/manual/13-rag-and-maintenance.md` | RAG 재인덱싱·문서 유지보수 |
| `docs/FINIX_MANUAL.md` | 개요·아키텍처·데이터 모델 (본 문서) |

문서 수정 후:

```bash
cd backend && python scripts/reindex_manual.py
# 또는 POST /api/v1/manual/reindex
# 또는 매뉴얼 챗 첫 질문 (checksum 자동 갱신)
```

## 시스템 개요

### 목적

- 자연어로 **시나리오**를 만들고, 서비스 시퀀스를 검토한 뒤 **테스트케이스**를 생성·실행합니다.
- 서비스별 **YAML 규칙**(에러/업무/코드 규칙)을 관리하고, 규칙에서 **HTTP 테스트케이스 풀**을 자동 생성합니다.
- 실행 결과를 **테스트 이력**에 저장해 재현·분석합니다.

### 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React, Vite, React Router, Tailwind |
| Backend | FastAPI, SQLAlchemy(async), Pydantic |
| DB | PostgreSQL(운영) / SQLite(로컬 기본) |
| LLM | OpenAI 호환 Chat Completions + Embeddings |
| 규칙 | YAML (DB Primary, 파일 Fallback) |

### 아키텍처 원칙

레이어는 **Router → Service → Repository**만 허용합니다.

- **Router**: HTTP 입출력, 검증, 서비스 호출만
- **Service**: 비즈니스 로직, LLM 오케스트레이션
- **Repository**: DB/파일 접근만

LLM은 **의도 파싱·시나리오 생성·YAML 규칙 초안·매뉴얼 Q&A**에만 사용합니다. 테스트케이스 본문 생성과 실행은 **템플릿·결정론적** 로직입니다.

## 메뉴 및 화면

### AI 시나리오 생성 (홈 `/`)

사용자 프롬프트를 LLM이 파싱해 **서비스 코드 시퀀스**를 제안합니다. CBS 카탈로그(`cbs_srvc.json` 또는 DB 카탈로그)를 검색해 후보 서비스를 매칭합니다.

생성 후 **시나리오 상세**(`/scenario/:id`)로 이동해 스텝을 수정·확정합니다.

### 시나리오 관리 (`/scenario-registry`)

저장된 시나리오 목록, 스텝 편집, 테스트케이스 생성, 실행 트리거를 제공합니다.

### 테스트케이스 관리 (`/test-cases`)

**서비스 코드(SRVC_CD)별** 테스트케이스 풀을 조회합니다. 시나리오에 아직 연결되지 않은 행(`scenario_id` null)이 풀입니다.

- **YAML에서 생성**: 활성(Active) YAML 규칙 번들에서 규칙 1건당 테스트케이스 1건을 DB에 적재합니다.
- 행 클릭 시 **요청(request_body)**·**예상 응답(expected_body, HTTP status)** JSON을 펼쳐 볼 수 있습니다.

### 규칙/메타 관리 (`/rules`)

사이드바 **「규칙/메타 관리」** 메뉴(경로 `/rules`)에서 서비스별 **YAML 규칙 번들**을 조회·등록·편집합니다. 로그인이 필요합니다.

| 상태 | 의미 |
|------|------|
| draft | 초안(DB에 저장됨). 테스트케이스 **YAML에서 생성** 불가 |
| approved | 승인됨(선택적 워크플로) |
| active | 운영 반영. 테스트케이스 생성·시나리오 규칙 참조에 사용 |

**중요:** YAML을 등록만 하고 **Active(활성화)** 하지 않으면 테스트케이스 관리의 「YAML에서 생성」이 실패합니다. 오류 예: `YAML 규칙은 등록되어 있으나 Active 상태가 아닙니다`.

## YAML 규칙 등록 방법 (단계별)

FINIX에서 「YAML 등록」이란, 서비스 코드(예: `PY027`)에 대한 규칙 YAML을 **DB 드래프트 번들**로 저장하는 것입니다. 화면은 **규칙/메타 관리**(`/rules`)입니다.

### 사전 준비

1. 로그인 후 **규칙/메타 관리**(`/rules`) 이동
2. 대상 **서비스 코드**가 카탈로그에 있는지 확인 (없으면 카탈로그 import 필요)
3. AI로 생성할 경우 백엔드 `.env`에 **`LLM_API_KEY`** 설정

### 방법 1 — 소스 붙여넣기 AI로 등록 (권장, UI 상단 버튼)

가장 흔한 등록 경로입니다. Java/Spring 검증·업무 로직 소스를 붙여넣어 YAML 초안을 만듭니다.

1. `/rules` 화면 상단 **「YAML 등록 (소스 기반 AI)」** 카드에서 **「소스 붙여넣기」** 클릭
2. 모달에서 항목 입력:
   - **서비스**: 콤보박스로 `PY027` 등 검색·선택
   - **소스 라벨 (source_version)**: 예) `source-scan`, 브랜치명, 티켓 ID
   - **추가 힌트 (선택)**: 클래스명, 에러코드, 엔드포인트 등
   - **소스 코드**: 컨트롤러·서비스·Validator 관련 코드 붙여넣기 (최소 약 16자 이상)
3. **「생성 · DB 등록」** 클릭 → LLM이 YAML 생성 → 서버가 스키마 검증 후 **draft** 번들로 DB 저장
4. **「YAML 등록 완료」** 안내 확인 (bundle `#id`, 버전 `v1`, 상태 `draft`)
5. 목록에서 해당 서비스 행을 클릭해 **YAML 편집** 탭에서 내용 검토·수정 후 **「저장(드래프트)」** (필요 시)
6. 패널 하단 **「활성화」** 클릭 → 상태가 **active**가 되어야 테스트케이스 생성 가능

API: `POST /api/v1/service-rules/{service_code}/generate-draft-from-source`

### 방법 2 — 기존 번들 YAML 직접 편집·저장

이미 레지스트리에 있는 서비스/번들을 손으로 고칠 때 사용합니다.

1. `/rules` 목록에서 서비스 행 클릭 (또는 새 서비스는 방법 1로 먼저 draft 생성)
2. 상세 패널에서 **「YAML 편집」** 탭 선택
3. 텍스트 영역에 YAML 작성·수정 (`service_code`, `rules[]`, `rule_id`, `expect`, `minimal_input` 등)
4. **「저장(드래프트)」** → 서버 검증 통과 시 draft로 DB 반영
5. **「활성화」** 로 active 전환

API: `POST /api/v1/service-rules/{service_code}` body `{ "yaml_text": "...", "source_version": "..." }`

### 방법 3 — 메타 기반 AI 생성 (API)

카탈로그 메타만으로 LLM이 YAML 초안을 만들 때 사용합니다. (UI 전용 버튼은 없을 수 있음)

- `POST /api/v1/service-rules/{service_code}/generate-draft`
- body: `objective`, `include_existing`, `created_by` 등

생성 후에도 **활성화** 단계는 동일합니다.

### 등록 후 — Active 활성화 (필수)

드래프트만 있으면 **테스트케이스 풀 생성 불가**입니다.

1. `/rules` 목록에서 해당 서비스 선택
2. 패널 하단 **「활성화」** 버튼 클릭  
   (선택: **「승인」** 후 활성화)
3. 목록 상태 필터에서 **Active**로 표시되는지 확인

API: `POST /api/v1/service-rules/{service_code}/{bundle_id}/activate`

### 등록 후 — 테스트케이스로 연결

1. **테스트케이스 관리**(`/test-cases`) 이동
2. 동일 **서비스 코드** 선택
3. **「YAML에서 생성」** 클릭
4. 행을 펼쳐 **요청(request_body)**·**예상 응답(expected)** 확인

### YAML 등록 FAQ

**Q. YAML 등록은 어디서 하나요?**  
A. **규칙/메타 관리** 메뉴(`/rules`). 상단 **「소스 붙여넣기」** 또는 목록에서 서비스 선택 후 **YAML 편집** 탭.

**Q. 등록했는데 테스트케이스 생성이 안 됩니다.**  
A. 번들이 **draft**인지 확인하세요. **활성화(Active)** 후 다시 「YAML에서 생성」하세요.

**Q. error / business / code 규칙이 모두 필요한가요?**  
A. 소스 AI 등록 시 검증 규칙상 세 유형을 포함해야 저장되는 경우가 있습니다. 검증 오류 메시지를 확인하세요.

**Q. 파일 `rules_yaml/PY027.yaml`만 있으면 되나요?**  
A. DB Primary 환경에서는 **Active DB 번들**이 우선입니다. 파일만 있고 Active 번들이 없으면 materialize가 실패할 수 있습니다.

### 테스트 이력 (`/history`)

과거 **실행(Execution)** 목록·상세. 스텝별 기대값/실제값·통과 여부를 확인합니다.

### 매뉴얼 (`/manual`)

이 문서를 **헤더 단위로 chunking·embedding**한 RAG 챗봇입니다. FINIX 설계·운영·메뉴 사용법을 질문할 수 있습니다.

## 데이터 흐름

### 1. 서비스 카탈로그

`cbs_srvc.json` 또는 DB `service_catalog_items`에 서비스 코드, 이름, HTTP 메서드, URI, 입력 필드 메타가 있습니다.

카탈로그 import API로 JSON을 DB에 upsert할 수 있습니다.

### 2. YAML 규칙 구조

```yaml
service_code: "PY016"
service_name: "..."
source_version: "..."
rules:
  - rule_id: "PY016-NEG-001"
    rule_type: error | business | code
    description: "..."
    expect:
      outcome: error
      http_status: 400
      error_code: "..."
    minimal_input: { ... }
    assertions: [ ... ]
    source_evidence:
      method: "validateX"
      snippet: "..."
```

- **minimal_input** → 테스트케이스 `request_body`
- **expect** → `expected_status`, `expected_body`
- **assertions** → 자동 검증 확장용(향후 실행기 연동)

### 3. 테스트케이스 materialize

`POST /api/v1/services/{service_code}/test-cases/materialize`

1. Active 규칙 번들 로드 (없으면 `rules_yaml/{code}.yaml` 파일 fallback)
2. `replace_existing=true` 시 해당 서비스 풀 기존 행 삭제
3. 규칙마다 `testcases` 행 생성 (`rule_bundle_id` 저장)

### 4. 시나리오 → 테스트케이스 → 실행

1. 시나리오 `steps_json`에 서비스 스텝 정의
2. `POST /api/v1/scenarios/{id}/test-cases/generate`로 스텝별 TC 생성
3. `POST /api/v1/executions` 등으로 실행·이력 저장

## LLM 사용 정책

| 기능 | LLM | 비고 |
|------|-----|------|
| 시나리오 의도 파싱 | O | 실패 시 휴리스틱 fallback |
| YAML 규칙 AI 생성 | O | temperature 낮음, 자가 검증·수리 루프 |
| 테스트케이스 생성 | X | YAML 규칙 템플릿 기반 |
| HTTP 실행 | X | 결정론적 |
| 매뉴얼 챗 | O | RAG: 매뉴얼 chunk retrieval + 답변 |

환경 변수: `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_EMBEDDING_MODEL`, `MANUAL_MD_PATH`

## API 요약

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/v1/scenarios` | 시나리오 생성 |
| GET | `/api/v1/scenarios/{id}` | 시나리오 조회 |
| POST | `/api/v1/scenarios/{id}/test-cases/generate` | 시나리오 TC 생성 |
| GET | `/api/v1/test-cases?service_code=` | 서비스별 TC 목록 |
| POST | `/api/v1/services/{code}/test-cases/materialize` | YAML→TC 풀 생성 |
| GET | `/api/v1/service-rules/registry` | 규칙 레지스트리 |
| POST | `/api/v1/service-rules/{code}/{id}/activate` | 번들 Active |
| POST | `/api/v1/manual/chat` | 매뉴얼 RAG 질의 |
| GET | `/api/v1/manual/status` | 매뉴얼 인덱스 상태 |

## 운영 가이드

### 로컬 실행

1. Backend: `cd backend && uvicorn app.main:app --reload --port 8000`
2. Frontend: `cd frontend && npm run dev` (프록시 `/api` → 8000)
3. `.env`에 DB URL, `LLM_API_KEY` 설정

### PostgreSQL

`DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/finix_db`

앱 기동 시 `init_db()`로 테이블 생성. Alembic은 선택.

### 규칙 → 테스트케이스 체크리스트

1. 규칙/메타에서 서비스 YAML 등록·검증
2. 번들 **Active** 활성화
3. 테스트케이스 관리에서 서비스 선택 → **YAML에서 생성**
4. 행 펼쳐 request/expected 확인
5. 필요 시 시나리오에 TC 연결 후 실행

### 자주 하는 실수

- **Draft만 있고 Active 없음** → materialize 400. Active 활성화 필요.
- **카탈로그에 없는 서비스 코드** → 엔드포인트/메서드 기본값 사용 가능하나 URI 확인 권장.
- **LLM 키 없음** → AI 시나리오·YAML AI·매뉴얼 챗 비활성 또는 오류.

## 매뉴얼 RAG 동작

1. `docs/FINIX_MANUAL.md`를 `##`/`###` 헤더 기준으로 chunking
2. 각 chunk를 embedding API로 벡터화해 DB `manual_chunks` 저장
3. 사용자 질문 embedding → 코사인 유사도 top-k chunk 검색
4. 검색된 chunk를 컨텍스트로 LLM이 한국어 답변 생성

문서 수정 후에는 `/api/v1/manual/reindex` 또는 앱 재기동 시 checksum 변경으로 자동 재인덱싱됩니다.

## 보안·권한

- `/history`, `/test-cases`, `/rules`, `/scenario-registry`, `/manual`은 로그인(`RequireAuth`) 필요
- 시나리오 생성 홈은 게스트 허용(설정에 따라 변경 가능)

## 확장 포인트

- YAML `assertions`를 실행 엔진에 연동
- 테스트케이스 행에서 원본 규칙(`rule_id`) 링크
- Draft 번들로 materialize 옵션(현재는 Active만)

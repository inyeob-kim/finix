# FINIX (Finance Intelligence eXecution)

금융/코어 뱅킹(CBS) **서비스 단위 API**를 기준으로, **업무·검증 규칙을 YAML로 정의**하고 그 규칙에서 **HTTP 테스트 케이스를 생성**하며, **시나리오(서비스 순서 + 선택한 케이스 조립)**로 묶어 **실행·이력**까지 한 흐름에서 다루기 위한 **내부 QA/자동화 도구**입니다.

### 무엇을 위해 만드는가

| 목적 | 설명 |
|------|------|
| **규칙의 단일 소스** | 서비스별 규칙을 DB 버전(드래프트 → 승인 → 활성)으로 관리하고, 필요 시 파일 YAML로 폴백해 미리보기·생성에 활용합니다. |
| **재현 가능한 테스트 케이스** | 시나리오 스텝(서비스 코드 시퀀스)과 활성 규칙 번들을 바탕으로 DB에 **머티리얼라이즈된 HTTP 테스트 케이스**를 만들고, 수정·보내기(Postman)까지 지원합니다. |
| **조립형 시나리오** | “이미 만들어진 테스트 케이스만 골라 순서를 정한다”는 관점에서 시나리오 레지스트리·실행 API와 맞춥니다. |
| **운영 친화** | 서비스 카탈로그(`cbs_srvc.json` 등) 임포트, 규칙 YAML AI 초안(목표 문장 또는 소스 붙여넣기), 실행 이력 조회 등을 API로 제공합니다. |

**백엔드**는 FastAPI, **프론트엔드**는 Vite + React입니다. 상세 요청/응답 스키마는 서버를 띄운 뒤 **Swagger UI**에서 확인할 수 있습니다.

- 대화형 문서: `http://127.0.0.1:8000/docs`  
- ReDoc: `http://127.0.0.1:8000/redoc`

---

## 저장소 구조

| 경로 | 설명 |
|------|------|
| `backend/` | FastAPI 앱, DB·도메인 로직, Alembic, `cbs_srvc.json`, 규칙 YAML 샘플(`app/rules_yaml/`) |
| `frontend/` | React UI (시나리오 레지스트리, 테스트 케이스 화면, 규칙/메타, 이력 등) |
| `docs/` | 팀 문서 (예: Git 푸시 시 주의사항) |

---

## API 기능 정리

아래 베이스 URL은 로컬 기준 `http://127.0.0.1:8000` 입니다.

### 1) 메인 REST — `/api/v1`

#### 시나리오 `/api/v1/scenarios`

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/v1/scenarios` | 프롬프트·제목으로 시나리오 생성(템플릿 기반 스텝 저장) |
| `GET` | `/api/v1/scenarios` | 시나리오 목록 (`saved`, `limit`, `offset` 쿼리) |
| `GET` | `/api/v1/scenarios/{scenario_id}` | 단건 조회(스텝 포함) |
| `PATCH` | `/api/v1/scenarios/{scenario_id}` | 제목·프롬프트·스텝 등 부분 수정 |
| `POST` | `/api/v1/scenarios/{scenario_id}/refine` | 사용자 지시로 시나리오 정제(현재 스텁) |
| `POST` | `/api/v1/scenarios/{scenario_id}/save` | 저장(북마크) 표시 |
| `DELETE` | `/api/v1/scenarios/{scenario_id}/save` | 저장 해제 |
| `GET` | `/api/v1/scenarios/{scenario_id}/test-cases` | 해당 시나리오에 연결된 HTTP 테스트 케이스 목록 |
| `POST` | `/api/v1/scenarios/{scenario_id}/test-cases/generate` | 스텝 기반으로 테스트 케이스 전부 재생성(기존 케이스 삭제 후 생성; 서비스 시퀀스가 있으면 YAML/DB 규칙 우선) |

#### 테스트 케이스 `/api/v1/test-cases`

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/v1/test-cases` | 쿼리 `service_code`(필수), `limit` — 해당 서비스에 매칭되는 **DB 적재** HTTP 테스트 케이스 목록 |
| `GET` | `/api/v1/test-cases/{testcase_id}` | 단건 조회 |
| `PATCH` | `/api/v1/test-cases/{testcase_id}` | 이름·메서드·엔드포인트·바디·기대값·스텝 순서 등 수정 |
| `GET` | `/api/v1/test-cases/{testcase_id}/export/postman` | Postman Collection v2.1 JSON 반환 |

#### 실행(시나리오 단위) `/api/v1/executions`

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/v1/executions` | 시나리오 ID·`base_url`로 해당 시나리오의 테스트 케이스 일괄 실행, 결과 상세 반환 |
| `GET` | `/api/v1/executions` | 실행 이력 페이지 (`limit`, `offset`) |
| `GET` | `/api/v1/executions/{execution_id}` | 단건 실행 상세(스텝별 결과) |

#### 규칙 YAML 미리보기 `/api/v1/rules-yaml`

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/v1/rules-yaml/{service_code}` | UI용 규칙 미리보기. **DB 활성 번들 우선**, 없으면 `app/rules_yaml/{코드}.yaml` 파일 로드 |

#### 서비스 카탈로그 `/api/v1/service-catalog`

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/v1/service-catalog` | 목록 (`query`, `limit`, `offset`) |
| `GET` | `/api/v1/service-catalog/{service_code}` | 서비스 코드 단건 |
| `POST` | `/api/v1/service-catalog/import` | `cbs_srvc.json`(설정 경로)에서 DB로 임포트·업서트 |

#### 서비스 규칙 번들(DB) `/api/v1/service-rules`

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/v1/service-rules/{service_code}` | **활성** 규칙 번들(YAML·파싱된 rules 포함) |
| `GET` | `/api/v1/service-rules/{service_code}/versions` | 서비스별 버전 목록 |
| `POST` | `/api/v1/service-rules/{service_code}` | YAML 텍스트로 **새 드래프트** 생성(서버 검증 후 저장) |
| `POST` | `/api/v1/service-rules/{service_code}/generate-draft` | LLM으로 드래프트 생성(목표 문장·기존 활성 YAML 참고 옵션); **`LLM_API_KEY` 필요** |
| `POST` | `/api/v1/service-rules/{service_code}/generate-draft-from-source` | 붙여넣은 **소스 코드** 기반 LLM 드래프트 생성·저장; **`LLM_API_KEY` 필요** |
| `POST` | `/api/v1/service-rules/{service_code}/{bundle_id}/approve` | 번들 승인 |
| `POST` | `/api/v1/service-rules/{service_code}/{bundle_id}/activate` | 번들 활성화 |
| `POST` | `/api/v1/service-rules/{service_code}/rollback` | 특정 버전으로 활성 롤백 |

---

### 2) 레거시·보조 REST (호환용)

프리픽스가 `/api/v1`과 다릅니다. 신규 연동은 **`/api/v1` 우선**을 권장합니다.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/scenario/generate` | 시나리오 생성(구 응답 형식) |
| `POST` | `/testcase/generate` | 단일 테스트 케이스 생성(플레이스홀더 성격) |
| `POST` | `/execution/run` | 단일 테스트 케이스 실행(스텁/레거시 로그) |

---

## 사전 요구

- **Python** 3.11+ 권장  
- **Node.js** 20+ 권장 (프론트 빌드·개발 서버)

## 백엔드

### 설정

`backend/.env` 파일을 두고 필요한 값을 설정합니다. (저장소에는 커밋하지 마세요.)

주요 변수는 `backend/app/core/config.py`의 `Settings`와 동일합니다.

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | 비동기 SQLAlchemy URL (미설정 시 SQLite: `backend/fcc_test_automation.db`) |
| `DATABASE_URL_SYNC` | Alembic 등 동기 마이그레이션용 URL (MySQL 등 사용 시) |
| `CORS_ORIGINS` | 허용 오리진 목록 (기본에 Vite 개발 포트 포함) |
| `LLM_API_KEY` | AI 규칙 생성 엔드포인트에 필요 |
| `LLM_MODEL`, `LLM_BASE_URL`, `LLM_TEMPERATURE` | LLM 호출 옵션 |
| `CBS_SERVICE_JSON_PATH` | CBS 서비스 카탈로그 JSON 경로 (기본: `backend/cbs_srvc.json`) |

### 설치 및 실행

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## 프론트엔드

### 설치 및 실행

```bash
cd frontend
npm install
npm run dev
```

- 개발 서버 기본: `http://127.0.0.1:5173`  
- Vite 프록시로 `/api` → `http://127.0.0.1:8000` 에 전달됩니다.

### 빌드·테스트

```bash
npm run build
npm run test
```

프로덕션에서 API 베이스를 바꿀 때는 `VITE_API_BASE_URL` 등을 사용합니다. 비밀값은 Git에 올리지 마세요.

---

## 문서

- [Git에 푸시하면 안 되는 것](docs/git-do-not-push.md)

## 라이선스

뱅크웨어글로벌 금융SW연구소

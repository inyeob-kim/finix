# FINIX

**Finance Intelligence eXecution** — CBS(코어 뱅킹) 서비스 API를 기준으로  
**업무 규칙을 YAML로 정의 → 테스트 케이스 생성 → 시나리오로 조립 → 실행·이력**까지  
한 흐름에서 다루는 내부 QA / 자동화 도구입니다.

<img width="1891" height="890" alt="image" src="https://github.com/user-attachments/assets/e6f19bf6-8ced-4533-aa9d-e267c7519c64" />

| | |
|---|---|
| 백엔드 | FastAPI + SQLAlchemy |
| DB | **PostgreSQL (Docker 권장)** 또는 SQLite |
| 프론트 | Vite + React |
| API 문서 | 서버 기동 후 [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) |

---

## 아키텍처 (한눈에)

```text
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React)                                           │
│  UI → Zustand 등 스토어 → API 클라이언트                     │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP /api/...
┌────────────────────────────▼────────────────────────────────┐
│  Backend (FastAPI)                                          │
│  Router → Service(업무 로직) → Repository(DB)                 │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     PostgreSQL / SQLite   CBS 카탈로그    LLM (선택)
     (Docker 권장)         cbs_srvc.json
```

**핵심 개념**

| 개념 | 역할 |
|------|------|
| **서비스 규칙 (YAML)** | 서비스별 정상/오류 케이스와 요청·기대값을 정의. 드래프트 → 적용(활성) 버전으로 관리 |
| **동적값 / 매크로** | `{{$…}}` 형태로 실행 시점에 날짜·생성기 등으로 치환. YAML·시나리오 컬렉션 변수에서 사용 |
| **테스트 케이스** | 활성 규칙에서 머티리얼라이즈된 HTTP 요청 단위 |
| **시나리오** | 여러 서비스/케이스를 순서대로 묶고, 스텝 간 값 연결·헤더·컬렉션 변수를 설정 |
| **실행** | Live 호출 또는 Export(Postman 등). 결과는 이력으로 조회 |

프론트는 **화면만**, 백엔드는 **검증·생성·실행·저장**을 담당합니다. LLM은 규칙 초안·생성기 초안 등 **보조**에만 쓰고, 실제 실행은 결정적입니다.

---

## 저장소 구조

```text
finix/
├── docker-compose.yml   # 로컬 PostgreSQL (Docker)
├── backend/             # FastAPI, DB, 도메인 로직, cbs_srvc.json
├── frontend/            # React UI
└── docs/                # 팀 문서
```

---

## 설치 (처음 한 번)

### 필요한 것

- **Python** 3.11+  
- **Node.js** 20+  
- **Docker Desktop** (PostgreSQL 쓸 때 — 팀 권장)

### 1) PostgreSQL (Docker) — 권장

Docker Desktop을 켠 뒤, 저장소 루트에서:

```bash
docker compose up -d
```

확인:

```bash
docker ps
# finix-postgres 가 Up 이면 OK
```

이미 컨테이너를 한 줄로 띄운 경우에도 이름은 동일합니다 (`finix-postgres`).  
다시 올릴 때는:

```bash
docker start finix-postgres
```

중지:

```bash
docker compose down          # 데이터 볼륨은 유지
# docker compose down -v   # DB 데이터까지 삭제할 때만
```

`docker compose`가 안 되면 (구버전 Docker):

```bash
docker run -d --name finix-postgres \
  -e POSTGRES_USER=fcc \
  -e POSTGRES_PASSWORD=fcc \
  -e POSTGRES_DB=finix_db \
  -p 5432:5432 \
  -v finix_pgdata:/var/lib/postgresql/data \
  postgres:16
```
<img width="1253" height="706" alt="image" src="https://github.com/user-attachments/assets/9145713f-08fd-4637-96fc-d362fec611b5" />

> Git Bash에서 PowerShell용 `` ` `` 줄바꿈은 쓰지 마세요. 위처럼 `\` 또는 **한 줄**로 실행합니다.

### 2) 백엔드

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
```

**PostgreSQL을 쓸 때** `backend/.env` 예:

```env
DATABASE_URL=postgresql+asyncpg://fcc:fcc@127.0.0.1:5432/finix_db
DATABASE_URL_SYNC=postgresql+psycopg://fcc:fcc@127.0.0.1:5432/finix_db
```

(로컬 개발용 계정입니다. 운영 비밀번호로 쓰지 마세요.)

스키마 반영 (최초 또는 마이그레이션 후):

```bash
alembic upgrade head
```

앱 기동 시 테이블이 없으면 자동 생성도 되지만, **Alembic으로 맞춰 두는 것**을 권장합니다.

**Docker 없이 빠르게 돌려볼 때** — `.env`에 `DATABASE_URL`을 두지 않으면  
SQLite(`backend/finix_db.db`)로 동작합니다.

| 자주 쓰는 설정 | 설명 |
|----------------|------|
| `DATABASE_URL` | 비동기 DB (Postgres / SQLite) |
| `DATABASE_URL_SYNC` | Alembic용 동기 URL (Postgres일 때) |
| `LLM_API_KEY` | AI로 규칙/생성기 초안 만들 때 필요 |
| `LLM_MODEL`, `LLM_BASE_URL` | LLM 엔드포인트·모델 |
| `CORS_ORIGINS` | 프론트 주소 (기본에 Vite `5173` 포함) |
| `CBS_SERVICE_JSON_PATH` | 서비스 카탈로그 JSON (기본 `cbs_srvc.json`) |

비밀키·`.env`는 Git에 올리지 마세요. → [docs/git-do-not-push.md](docs/git-do-not-push.md)

### 3) 프론트엔드

```bash
cd frontend
npm install
```

---

## 실행 (매일)

**0) DB** — Docker Desktop 실행 후 Postgres가 떠 있는지 확인

```bash
docker start finix-postgres
# 또는: docker compose up -d
```

**1) API**

```bash
cd backend
.venv\Scripts\activate          # 또는 source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**2) UI**

```bash
cd frontend
npm run dev
```

브라우저에서 **[http://127.0.0.1:5173](http://127.0.0.1:5173)** 을 엽니다.  
프론트의 `/api` 요청은 Vite가 `8000` 포트로 프록시합니다.

백엔드가 안 뜨고 `Connection refused ... 5432` 이면 → Postgres 컨테이너가 꺼져 있는 경우가 많습니다.

---

## 사용 흐름 (권장 순서)

로그인 후 대략 다음 순서로 쓰면 됩니다.

### 1. 규칙 / 메타 (`/rules`)

1. 서비스 카탈로그에서 대상 서비스를 고릅니다.  
2. **YAML 편집**으로 케이스(N/E)·요청·기대값을 작성합니다.  
   - **동적값** 패널에서 Generator / Date / AI 생성기를 골라 필드에 넣을 수 있습니다.  
3. 초안 저장 후 **적용**하면 그 버전이 테스트 케이스의 기준이 됩니다.  
4. 같은 화면에서 서비스별 **테스트 케이스**를 만들고 단건 실행·결과를 볼 수 있습니다.

Postman·소스에서 YAML을 채우는 방법은 아래 **「Postman / 소스에서 규칙 가져오기」**를 보세요.

<img width="1845" height="898" alt="image" src="https://github.com/user-attachments/assets/8d05f28a-e0dd-4410-8650-515e787f62c9" />

### 2. 시나리오 레지스트리 (`/scenario-registry`)

1. 폴더를 만들고 시나리오를 추가합니다.  
2. 서비스 순서를 정한 뒤, 각 스텝에 쓸 **규칙 기반 테스트 케이스**를 고릅니다.  
3. 스텝 간 **값 연결**, **컬렉션 변수**(고정값 또는 동적 생성기), 헤더를 설정합니다.  
4. **실행**(Live)하거나 **Postman Export**로 내보냅니다.

<img width="945" height="818" alt="image" src="https://github.com/user-attachments/assets/fc4c1bb8-9d99-4af4-b717-563c62b99667" />

### 3. 이력 (`/history`)

시나리오·배치 실행 결과를 날짜·필터로 조회합니다.

### 그 외 화면

| 메뉴 | 용도 |
|------|------|
| 대시보드 | 요약·진입점 |
| 데이터 풀 | 실행/로그 기반 샘플 데이터 |
| OpenAPI 임포트 | 스펙 기반 보조 입력 |
| 매뉴얼 챗 | 제품 매뉴얼 Q&A (설정 시) |

---

## Postman / 소스에서 규칙 가져오기

규칙 화면(`/rules`)에서 기존 Postman 컬렉션이나 백엔드 소스로 **YAML 작업본(드래프트)** 을 만들 수 있습니다.  
결과는 바로 “적용본”이 아니라 **드래프트**이므로, 확인 후 **적용**해야 테스트 케이스 기준이 됩니다.  
(`LLM_API_KEY` 설정이 필요합니다. 없으면 휴리스틱 폴백으로 동작할 수 있습니다.)

### Postman에서 가져오기

1. **Postman에서 가져오기**를 누릅니다.  
2. **Collection** JSON을 올립니다. (선택) **Environment** JSON도 같이 올리면 `{{var}}` 치환에 사용합니다.  
3. 가져오기를 실행하면 백그라운드 잡으로 처리되고, 서비스별 드래프트가 생깁니다.

<img width="941" height="820" alt="image" src="https://github.com/user-attachments/assets/933d643e-d893-43a1-9ada-fd0e025cfa34" />

**서비스 매핑**

- 요청 URL/path를 CBS 카탈로그(`cbs_srvc.json`) URI와 맞춰 **서비스 코드**를 고릅니다.  
- 매칭되지 않은 요청은 `unmatched`로 남고, 해당 서비스 YAML에는 들어가지 않습니다.

**Create vs Merge (서비스마다 자동 선택)**

| 상황 | 모드 | 동작 |
|------|------|------|
| 해당 서비스에 **적용본(활성 YAML)이 없음** | **create** | Postman 요청들로 **새 규칙 세트**를 구성해 드래프트로 저장 |
| 이미 **적용본이 있음** | **merge** | 적용본을 기준으로 후보를 **맞춰 보강**한 뒤 드래프트로 저장 |

```text
Postman Collection
        │
        ▼
 요청 파싱 → 서비스별 그룹
        │
        ├── 적용본 없음 ──► Create 계획 ──► 새 YAML 드래프트
        │
        └── 적용본 있음 ──► Merge 계획 ──► 보강된 YAML 드래프트
                                              │
                                              ▼
                                    (사용자) 검토 → 적용
```

**Create 때**

- 요청들을 업무 케이스(N/E)로 묶습니다. (비슷한 검증이면 하나로 합칠 수 있음)  
- 제목·설명은 업무 의도 위주(한글 권장).  
- body 필드를 임의로 지어내지 않고, Postman body + DTO 스켈레톤을 합칩니다.

**Merge 때 (후보마다)**

| 판정 | 의미 |
|------|------|
| **match** | 기존 `case_id`와 같은 업무 케이스로 보고 **input만** 전략에 따라 갱신. 기대값(expect)은 건드리지 않음 |
| **add** | 기존에 없는 케이스로 보고 **새 case** 추가. 애매하면 add 쪽 |

**match 시 input 전략**

| 전략 | 언제 |
|------|------|
| `overlay_postman_values` | Postman 값으로 기존 필드를 덮어씀 |
| `keep_base_macros` | 기존 YAML의 `{{$…}}` 동적값을 유지하고 싶을 때 우선 |
| `fill_nulls_only` | 비어 있는 칸만 Postman 값으로 채움 |

**작업본이 이미 있을 때**

- 해당 서비스에 **미적용 드래프트**가 있으면 기본 가져오기는 막힐 수 있습니다.  
- 드래프트를 정리·적용한 뒤 다시 가져오거나, API에서 `overwrite_draft`로 덮어쓰는 방식이 있습니다.

### 소스에서 YAML 생성

같은 규칙 화면의 **소스에서 YAML 생성**은 Java/Kotlin 등 소스를 붙여 넣어 드래프트를 만듭니다.

- 적용본이 없으면 **새로 생성**, 있으면 Postman과 비슷한 **merge** 흐름으로 기존 케이스를 보강합니다.  
- Postman으로 만든 베이스에 소스로 채울 때는 매크로 유지(`keep_base_macros`) 쪽이 자주 쓰입니다.

### 가져오기 이후 체크리스트

1. 서비스별 **드래프트** YAML을 연다.  
2. 케이스 제목·N/E·input·expect를 확인한다. (동적값 필요 시 패널로 보강)  
3. **적용**한다.  
4. 테스트 케이스를 재생성·실행한다.

---

## 동적값이란?

요청 JSON 안의 문자열을 실행 시점에 실제 값으로 바꿉니다.

- YAML: 필드에 `{{$…}}` 매크로 삽입 (동적값 패널)  
- 시나리오: `{{변수명}}` 컬렉션 변수 + 내장/공유 **생성기** (AI로 새 생성기 초안 가능)

실행·Export 시 서버/스크립트가 매크로·변수를 해석합니다. (Postman으로 보낼 때는 Postman 변수 형태로 변환됩니다.)

---

## 문제 해결 빠른 팁

| 증상 | 확인 |
|------|------|
| `Connection refused ... 5432` | Docker Desktop + `docker start finix-postgres` |
| UI에서 API 실패 | 백엔드 `8000` 기동 여부, 브라우저 콘솔·Network |
| AI / Postman 가져오기 실패 | `LLM_API_KEY`, 모델·베이스 URL |
| Postman 가져오기 거부 (작업본) | 해당 서비스 드래프트를 적용·삭제한 뒤 재시도 |
| DB가 비어 있음 | 서비스 카탈로그 임포트, 규칙 적용 여부 |
| CORS 오류 | `CORS_ORIGINS`에 프론트 주소 포함 |

---

## 문서

- [Git에 올리면 안 되는 것](docs/git-do-not-push.md)  
- 상세 개요·발표용 메모: `docs/FINIX_OVERVIEW.md` 등  

API 요청/응답 스키마는 서버를 켠 뒤 **Swagger**(`/docs`)를 참고하세요.

---

## 라이선스

뱅크웨어글로벌 금융SW연구소

# Git에 푸시하면 안 되는 것 (백엔드 / 프론트엔드)

원격 저장소에 올리면 보안·환경·리뷰 노이즈 문제가 되는 항목을 정리했습니다.  
루트 `.gitignore`에 일부는 이미 반영되어 있습니다.

---

## 공통

| 항목 | 이유 |
|------|------|
| **`.env`, `.env.local`, `.env.*`** (예외: `!.env.example`) | DB URL, API 키, JWT 비밀 등 실배포/개인 자격 증명 |
| **키·인증서** (`.pem`, `.key`, `*.p12`, `id_rsa` 등) | 서버·클라이언트 인증 재사용 금지 |
| **로그·덤프에 포함된 토큰/요청 본문** | 운영 데이터 유출 |
| **IDE 개인 설정 전체** (`.idea/` 등) | 팀원마다 다름, 경로·로컬 URL이 섞일 수 있음 |
| **OS 잡파일** (`.DS_Store`, `Thumbs.db`) | 불필요 |

---

## 백엔드 (`backend/`)

| 항목 | 이유 |
|------|------|
| **`backend/.env`** (또는 프로젝트 루트의 `.env`) | `DATABASE_URL`, `LLM_API_KEY`, 외부 API 키 등 |
| **가상환경 디렉터리** (`venv/`, `.venv/`, `env/`) | 용량·OS별 바이너리, 재현은 `requirements.txt` 등으로 |
| **`__pycache__/`, `*.pyc`** | 빌드 산출물 |
| **`.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`** | 로컬 캐시 |
| **커버리지 산출물** (`.coverage`, `htmlcov/`, `coverage.xml`) | 로컬 실행 결과 |
| **DB 덤프·스냅샷** (`*.sql`, `dump.rdb`, SQLite 파일 등) | 개인/운영 데이터, 용량 |
| **로컬 전용 설정** (개인 디버그 스크립트에 하드코딩한 URL/키) | 실수 커밋 방지 |

백엔드 예시는 **`backend/.env.example`**(또는 루트 `!.env.example`)처럼 **변수 이름만** 두고, 값은 비우거나 더미로 두는 방식이 안전합니다.

---

## 프론트엔드 (`frontend/`)

| 항목 | 이유 |
|------|------|
| **`node_modules/`** | `package-lock.json` / `pnpm-lock.yaml`으로 재설치 |
| **`frontend/dist/`** (또는 `build/`) | CI·배포 파이프라인에서 생성 |
| **`frontend/.env`, `frontend/.env.local`, `VITE_*`에 실키** | 브라우저 번들에 노출될 수 있음 |
| **npm/yarn/pnpm debug 로그** | 로컬 경로·캐시 정보 |
| **`.vite/` 캐시** (생성 시) | 로컬 빌드 캐시 |

프론트는 **`VITE_API_BASE_URL` 등 예시만** 문서나 `.env.example`에 두고, 실제 URL·키는 각자 로컬 `.env`에만 두는 것이 좋습니다.

---

## 이미 루트 `.gitignore`에 들어 있는 것

- 위 표의 대부분: `.env*`, `venv/`, `__pycache__/`, `node_modules/`, `frontend/dist/`, `frontend/.vite/`, `.idea/`, 테스트·린터 캐시 등

`.gitignore`에 없어도 **푸시하면 안 되는 것**(비밀값을 코드에 직접 적은 커밋 등)은 규칙으로 막히지 않으므로, PR 전에 검색하는 습관이 필요합니다.

---

## 푸시 전에 한 번씩 확인하면 좋은 검색어

```text
API_KEY
SECRET
PASSWORD
BEGIN PRIVATE KEY
sk-
Bearer 
```

(실제 키 형식에 맞춰 팀 규칙을 추가하면 됩니다.)

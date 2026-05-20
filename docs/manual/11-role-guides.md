# 역할별 가이드

## QA 테스터 (시나리오·실행 중심)

### 매일 쓰는 메뉴

1. **AI 시나리오 생성** (`/`) — 빠른 시나리오 초안
2. **시나리오 편집** — 스텝 순서·서비스 코드 확정
3. **테스트케이스** — TC 생성·**테스트 실행**·결과 확인
4. **테스트 이력** — 참고용 (Mock 한계 인지)

### 하지 않아도 되는 것

- YAML 소스 AI 등록 (규칙 담당)
- 카탈로그 import (운영)

### QA 체크리스트 (릴리즈 전)

- [ ] 대상 서비스 Active YAML 존재
- [ ] materialize 후 TC request/expected 샘플 검토
- [ ] 시나리오 실행 passed 비율 기록
- [ ] 실패 스텝 expected vs actual 스크린샷

---

## 규칙/YAML 작성자

### 매일 쓰는 메뉴

1. **규칙/메타 관리** (`/rules`)
2. **소스 붙여넣기** → draft
3. **YAML 편집** → 검증·수정
4. **활성화** (운영 반영)

### 작성 품질 기준

- `rule_id` 고유, `{CODE}-E-` / `-B-` / `-C-` 접두 관례
- `error` 규칙: `error_code` + `assertions`
- `minimal_input`은 실제 API 필드명과 일치
- `source_evidence`에 method·snippet (AI 생성 시)

### handoff to QA

「PY027 v3 Active 활성화 완료, TC materialize 해 주세요」+ bundle id.

---

## 플랫폼 운영자

### 담당 작업

| 작업 | 방법 |
|------|------|
| DB·env | `DATABASE_URL`, `LLM_API_KEY`, `CBS_SERVICE_JSON_PATH` |
| 카탈로그 갱신 | `POST /service-catalog/import` |
| 매뉴얼 RAG 갱신 | `POST /manual/reindex` |
| 백업 | PostgreSQL dump, `cbs_srvc.json` 버전 관리 |

### 배포 후 확인

1. `GET /api/v1/manual/status` — chunk_count > 0
2. 샘플 `POST /manual/chat` — YAML 등록 질문
3. 샘플 materialize — Active 서비스 1건

### 보안 (현재 갭)

- 프론트 Mock 로그인만 있음 → 운영 시 SSO/JWT·API 인증 도입 권장
- `LLM_API_KEY` secret manager 보관

---

## 역할 × 메뉴 매트릭스

| 메뉴 | QA | 규칙 작성 | 운영 |
|------|:--:|:--------:|:----:|
| AI 시나리오 | ● | ○ | ○ |
| 시나리오 레지스트리 | ● | ○ | ○ |
| 규칙/메타 | ○ | ● | ● |
| 테스트케이스 관리 | ● | ● | ○ |
| 테스트 실행 | ● | ○ | ○ |
| 테스트 이력 | ● | ○ | ○ |
| 매뉴얼 | ● | ● | ● |

● 주 사용 ○ 가끔

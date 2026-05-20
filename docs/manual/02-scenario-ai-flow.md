# AI 시나리오 생성 흐름

## 화면: AI 시나리오 생성 (`/`)

로그인 **불필요**. 사이드바 첫 메뉴.

### 화면 구성

| 영역 | 내용 |
|------|------|
| 페이지 제목 | AI 시나리오 생성 |
| 생성 프롬프트 | 큰 textarea |
| 고급 옵션 | 접기/펼치기 → 규칙 버전 Active/Draft (표시만, API 미전달) |
| 추천 칩 | 예: 「출금 에러 테스트」, 「입금 성공/실패 시나리오」 |
| 시나리오 생성 | Primary 버튼 |
| 단축키 | ⌘/Ctrl + Enter |

### 사용자 절차

1. 프롬프트에 원하는 업무 흐름을 한국어/영어로 입력
2. (선택) 고급 옵션에서 규칙 버전 확인 — **현재는 UI 표시용**
3. **시나리오 생성** 클릭
4. 성공 시 `/scenario/{id}` 로 자동 이동

### 백엔드 (`POST /api/v1/scenarios`)

```json
{ "prompt": "...", "title": null }
```

처리 순서:

1. `CbsServiceCatalogRepository.search_by_prompt` — `cbs_srvc.json` 또는 DB 카탈로그
2. `LLM_API_KEY` 있으면 `complete_json` intent (서비스 코드 시퀀스, title)
3. 실패 시 휴리스틱 fallback
4. `scenarios` 테이블 INSERT, `steps_json` 저장

### LLM 없을 때

시나리오는 생성되나 intent 품질이 떨어질 수 있습니다. 운영 환경에서는 `LLM_API_KEY` 필수 권장.

---

## 시나리오 편집 (`/scenario/:scenarioId`)

### 화면 구성

| UI | 설명 |
|----|------|
| 스텝 목록 | 번호, action, result, reason |
| 드래그 핸들 | 순서 변경 |
| 삭제 | 스텝 제거 |
| 단계 추가 | 빈 스텝 추가 |
| 테스트 케이스 생성 | Primary — TC 화면 이동 |

### 사용자 절차

1. AI가 제안한 스텝 검토
2. 잘못된 서비스 코드 수정 (action 문자열 또는 메타)
3. 순서 DnD 조정
4. **테스트 케이스 생성** — 서버에 PATCH 후 generate

### API

| Method | Path | 용도 |
|--------|------|------|
| GET | `/scenarios/{id}` | 로드 |
| PATCH | `/scenarios/{id}` | title, prompt, steps |
| POST | `/scenarios/{id}/test-cases/generate` | TC 생성 |

### TC 생성 규칙

- 스텝의 `service_code`마다 **Active YAML** 로드
- 규칙 1건 = TC 1건 (LLM 미사용)
- Active 규칙 없는 스텝은 TC가 비거나 스킵될 수 있음

### 다음 단계

`/test-case/{scenarioId}` — 실행·Postman export

---

## 홈 vs 시나리오 레지스트리

| 항목 | 홈 `/` | 레지스트리 `/scenario-registry` |
|------|--------|----------------------------------|
| 저장 | DB `scenarios` | browser localStorage |
| 로그인 | 불필요 | 필요 |
| AI 생성 | ● | 수동 등록 마법사 |
| 팀 공유 | DB 백업 | Export/Import JSON |

둘은 **동기화되지 않습니다.**

# 엔드투엔드 워크스루: PY027 (YAML → TC → 실행)

`PY027` (terminate AutoSweep) 기준으로 **처음부터 끝까지** 한 바퀴 도는 예시입니다. 서비스 코드만 바꿔 동일 절차를 반복하면 됩니다.

## 전제

- Backend `8000`, Frontend `5173` 실행
- `LLM_API_KEY` 설정 (YAML AI·선택적 시나리오 AI)
- 카탈로그에 `PY027` 존재 (`cbs_srvc.json` import 완료)
- 로그인 (`qa.editor`)

---

## Phase A — 카탈로그 (최초 1회)

```bash
curl -X POST http://127.0.0.1:8000/api/v1/service-catalog/import
```

확인:

```bash
curl "http://127.0.0.1:8000/api/v1/service-catalog/PY027"
```

---

## Phase B — YAML 규칙 등록·활성화

### B-1. 소스 AI로 draft 생성

1. `/rules` → **소스 붙여넣기**
2. 서비스: `PY027`
3. source_version: `e2e-2026-05`
4. 소스 코드: AutoSweep 종료 관련 Validator/Service 코드 붙여넣기
5. **생성 · DB 등록** → bundle `#N` draft

### B-2. 검토·활성화

1. 목록에서 `PY027` **편집**
2. **YAML 편집** 탭에서 `rules[]` 확인 (`rule_id`, `minimal_input`, `expect`)
3. **활성화** 클릭 → status `active`

### B-3. 검증 API (선택)

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/service-rules/PY027/5/activate"
# bundle id는 환경마다 다름
```

---

## Phase C — 테스트케이스 풀 생성

1. `/test-cases`
2. 서비스 `PY027` 선택
3. 생성 메모: `e2e-regression` (선택)
4. **기존 풀 삭제 후 재생성** 체크 (재실행 시)
5. **YAML에서 생성**
6. 행 펼쳐 `request_body` / `expected_body` 확인

API:

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/services/PY027/test-cases/materialize" \
  -H "Content-Type: application/json" \
  -d "{\"replace_existing\": true, \"instruction\": \"e2e-regression\"}"
```

---

## Phase D — 시나리오 생성 (DB)

### D-1. AI 홈 (선택)

1. `/` 프롬프트: `PY027 AutoSweep 종료 시나리오`
2. **시나리오 생성** → `/scenario/{id}`

### D-2. 스텝 확정

1. 스텝에 `PY027` 포함 확인
2. **테스트 케이스 생성** → `/test-case/{scenarioId}`

### D-3. 시나리오 TC 생성

1. TC 없으면 **테스트케이스 생성**
2. 좌측 목록에 규칙별 TC 표시 확인

---

## Phase E — 실행·결과

1. **테스트 실행** 클릭
2. `/execution-result/{executionId}` 이동
3. 스텝별 passed/failed, expected vs actual 확인

API:

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/executions" \
  -H "Content-Type: application/json" \
  -d "{\"scenario_id\": 1, \"base_url\": \"\"}"
```

---

## Phase F — (선택) 레지스트리 워크스페이스

DB 시나리오와 별도로 문서화·메트릭 관리 시:

1. `/scenario-registry`
2. 폴더 생성 → **등록** 마법사
3. 서비스 시퀀스에 `PY027` 추가
4. **저장** → localStorage
5. Wand → `/test-case` registry 모드

---

## 체크리스트

- [ ] PY027 Active 번들 존재
- [ ] `/test-cases`에 TC ≥ 1
- [ ] TC Input/Output이 YAML `minimal_input`/`expect`와 일치
- [ ] 시나리오 실행 완료 URL 확보
- [ ] (운영) 실 HTTP 필요 시 `base_url`·실행기 교체 계획

## 실패 시 빠른 진단

| 증상 | 확인 |
|------|------|
| materialize 400 | Active 여부, draft만 있는지 |
| TC 0건 | rules[] 비어 있지 않은지 |
| 실행 전부 failed | 시뮬레이터 한계 vs 기대값 불일치 |
| History 비어 있음 | Mock UI — execution URL 직접 사용 |

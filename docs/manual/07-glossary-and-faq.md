# 용어집과 FAQ

## 용어

| 용어 | 설명 |
|------|------|
| SRVC_CD / service_code | CBS 서비스 코드 (예: PY027) |
| 규칙 번들 | 한 서비스의 YAML 규칙 묶음 (버전별) |
| draft | 초안. TC materialize 불가 |
| active | 운영 반영 규칙. TC 생성에 사용 |
| TC 풀 | `scenario_id` null 테스트케이스 |
| materialize | YAML 규칙 → TC DB 적재 |
| 레지스트리 | localStorage 시나리오 워크스페이스 |

## 자주 묻는 질문

### YAML 등록은 어디서 하나요?

**규칙/메타 관리** (`/rules`). **소스 붙여넣기** 또는 **YAML 편집** 탭. 자세한 절차는 `FINIX_MANUAL.md`의 「YAML 규칙 등록 방법」.

### 등록했는데 테스트케이스 생성 실패

번들이 **draft**이면 실패합니다. **활성화(Active)** 후 `/test-cases`에서 「YAML에서 생성」.

### AI 시나리오와 레지스트리 차이

- **홈 `/`**: DB 시나리오 생성
- **시나리오 관리**: 브라우저 localStorage, Export/Import

### 테스트 이력이 비어 있거나 이상함

History는 **Mock**일 수 있습니다. 실제 실행은 TestCase 화면 실행 후 `/execution-result/{id}` URL 사용.

### 매뉴얼 챗이 모른다고 답함

1. `docs/manual/` 챕터·`FINIX_MANUAL.md`에 내용 추가
2. `python backend/scripts/reindex_manual.py` 실행
3. 질문에 **메뉴 경로·서비스 코드** 포함 (예: 「/rules YAML 등록」)

### 시나리오 레지스트리와 홈 차이

홈은 DB, 레지스트리는 localStorage. Export/Import로만 공유.

### 실행이 실 API를 호출하나요?

아니요. 현재 **시뮬레이터**. `ExecutionCreateV1.base_url`은 향후 실 HTTP용.

### Postman export는 어디서

`/test-case/:scenarioId` → TC 선택 → **포스트맨으로보내기**.

### LLM 없이 쓸 수 있나?

- 시나리오: 휴리스틱 fallback (품질 제한)
- YAML AI·매뉴얼: **LLM_API_KEY 필수**
- TC 생성·실행: LLM 불필요

## 알려진 제한 (구현 갭)

- 백엔드 API 무인증
- 실행 = 시뮬레이터 (실 HTTP 아님)
- History ↔ executions API 미연동
- 카탈로그 import UI 없음
- Home의 ruleVersion은 UI only

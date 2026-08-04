# 시나리오 바인딩·Postman·Live 채널

시나리오 `steps_json`은 서비스 스텝 목록뿐 아니라 **데이터 흐름(postman, inject, extract)** 을 담습니다.

## steps_json 구조 (요약)

```json
{
  "steps": [
    {
      "number": 1,
      "action": "Inquire Auto Sweep Results",
      "service_code": "PY025",
      "injects": [{ "var": "brnchId", "from": "context.brnchId", "path": "brnchId" }],
      "extracts": [{ "var": "lastDt", "path": "outList[0].dt" }]
    }
  ],
  "postman": {
    "base_url": "http://host:8088",
    "default_headers": [{ "key": "srvcCd", "value": "PY025" }],
    "start_vars": [{ "key": "brnchId", "value": "001" }],
    "collection_vars": []
  }
}
```

| 필드 | 역할 |
|------|------|
| injects | 이전 context → 요청 body 필드 치환 |
| extracts | 응답 JSON → context 변수 |
| overrides | 템플릿 body 고정 덮어쓰기 |
| postman | export·Live 실행 시 baseUrl·헤더·변수 |

## resolve-preview (드라이런)

| API | 용도 |
|-----|------|
| `POST /scenarios/resolve-preview` | 저장 전 인라인 draft |
| `POST /scenarios/{id}/resolve-preview` | 저장된 시나리오 |

응답: 스텝별 `template_request_body`, `resolved_request_body`, `actual_*`(simulate 시), `context_after`.

## AI 연결 제안

```http
POST /api/v1/scenarios/suggest-bindings
{ "service_codes": ["PY027", "PY028"] }
```

카탈로그 input/output 필드 기반 inject/extract 초안. 사용자가 레지스트리에서 검토·수정 후 저장.

자동 추론(저장 시): `ScenarioAutoBindingsService` — 시나리오 저장·마법사에서 바인딩 초안.
Postman export는 **저장된 바인딩만** 사용합니다(export 시점 자동 보강 없음).

## Postman Collection export

`GET /api/v1/scenarios/{id}/export/postman`

| Query | 기본 | 설명 |
|-------|------|------|
| resolved | true | inject 반영된 body |
| native | true | `{{var}}` + pm.test extract 스크립트 |

- `build_postman_for_scenario`: 스텝 순서, 헤더, 이벤트 스크립트, collection variables
- 공유/커스텀 생성기(`pick_from_list` 등): generator catalog를 넘겨 초기값을 resolve하고, 컬렉션 pre-request에서 **Runner 실행의 첫 요청**에 재생성
- 레지스트리 **컬렉션 ZIP**: 완료(`ready`)이고 **모든** pick에 DB testcase id가 있는 시나리오만 포함 (draft·부분 미저장 제외)

### 생성기 vs Postman

| 채널 | 동작 |
|------|------|
| Live 실행 | 매 실행 catalog로 resolve |
| Postman export | 초기값 스냅샷 + 컬렉션 prerequest로 Runner iteration마다 첫 요청에서 재시드 |

FINIX 전용 생성기 엔진이 Postman 안에 그대로 들어가지는 않습니다. builtin·`pick_from_list`·`date_offset` 등은 JS로 이식됩니다.

## Live HTTP 실행 시 헤더

모든 스텝에 **동일** `default_headers`가 붙습니다(스텝별 `srvcCd` 자동 분기는 아직 없음).

### 권장 설정 (CBS/BXMC)

1. Postman에서 **성공하는 호출**의 헤더를 복사
2. 레지스트리 **Postman 설정** → 기본 헤더에 반영
3. 특히:
   - `srvcCd` = 서비스 코드 (예: `PY025`)
   - `scrnId` = 채널 화면 ID
   - `instCd`, `deptId`, `staffId` = 대상 서버(`baseUrl`) 환경 값
   - `txDt` = YYYYMMDD (실행 시 자동 갱신)

### 오류 패턴

| 증상 | 해석 |
|------|------|
| HTTP 500, `CbbSystemProcessHandler.preHandle`, `AAPCME0072` | 채널/시스템 검증 실패 (본문 검증 전) |
| HTTP 400, `AAPCME0006` 등 | 필드 검증 (YAML negative TC와 일치 기대) |
| Simulate 통과, Live 실패 | stub vs 실제 SUT 차이 |

FINIX 버그가 아니라 **SUT 응답**을 그대로 보여 주는 경우가 많습니다.

## save-definition (레지스트리 → DB)

```http
POST /api/v1/scenarios/{id}/save-definition
{
  "title": "...",
  "steps": [...],
  "postman": { "base_url": "...", "default_headers": [...] },
  "per_step": [[101, 102], [201]],
  "mark_saved": true
}
```

- `per_step`: logical step마다 풀 testcase id 목록 → 시나리오에 clone attach
- `postman`만 보내고 `steps` 생략 시: 기존 steps를 유지한 채 Postman 설정만 envelope에 병합
- 실행·export 전 persist에 사용

## 관련 API·화면

- 화면: `/scenario-registry` 연결 마법사, `ScenarioExecutionValuesPanel`, `ScenarioResolvePreviewPanel`
- API: `06-api-reference.md` Scenarios 절
- 실행: `04-test-cases-and-execution.md`

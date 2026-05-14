## FINIX 발표용 개요 (Finance + Intelligence eXecution)

FINIX는 **금융 업무 API 카탈로그(CBS 서비스 목록)**를 바탕으로, 사용자의 자연어 요청을 **시나리오 → 테스트 케이스 → 실행 결과**로 이어지게 만드는 **지능형 QA 자동화 도우미**입니다.

---

### 발표용 한 줄 요약

- **“업무 프롬프트 한 줄 → 실제 서비스 기반 테스트 시나리오/케이스/실행까지”**

---

### 1) FINIX로 할 수 있는 일

- **시나리오 생성**: 자연어로 입력한 업무 요청을 “단계(steps)”로 생성
- **테스트 케이스 생성**: 시나리오 단계를 HTTP 테스트 케이스로 변환
- **실행 및 이력**: 실행 결과를 저장하고 조회
- **저장/관리**: 시나리오 저장(북마크) 및 목록 관리

---

### 2) 사용자 흐름(데모 스크립트)

1. **새 테스트**에서 프롬프트 입력  
2. FINIX가 **시나리오 단계** 생성(서비스명/코드/URI 근거 포함)  
3. 사용자가 단계 수정/정렬  
4. **테스트 케이스 생성** → 단계별 HTTP 케이스 생성  
5. **실행** → 결과/이력 확인  

---

### 3) FINIX가 시나리오를 만드는 방식(핵심 파이프라인)

FINIX는 시나리오를 하드코딩 템플릿으로 만들지 않고, **카탈로그 기반 + (가능하면) LLM 추론**으로 구성합니다.

- **입력**: 사용자 프롬프트
- **출력**: 시나리오 단계 목록(각 단계는 성공/실패 예상 + 서비스 근거 포함)

파이프라인(요약):

- **(선택) LLM 기반 intent 추출**: 자연어 요청을 구조화된 단계 의도(intent)로 변환
- **룰 엔진 적용**: 도메인 규칙으로 단계 흐름 보정(예: 사망 등록 → 상속 처리)
- **서비스 매핑**: `cbs_srvc.json`에서 후보를 점수화해 적합한 서비스 선택
- **최종 step 구성**: UI 표시용(`action=서비스명`, 상세에 code/method/uri/intent)

---

### 4) 서비스 매핑(검색) 가중치 — 발표용 요약 + 예시

서비스 매핑은 “비슷해 보이는 것”을 고르는 게 아니라, **근거를 점수화**해 선택합니다(100점 만점).

#### 4-1) 가중치(100점)

- **서비스명(service_name)**: 55점  
- **URI/도메인(prefix)**: 20점  
- **DTO(입/출력 이름)**: 15점  
- **Operation/Class 힌트**: 10점  

#### 4-2) 예시(요약)

프롬프트: “고객 사망 후 상속계좌 처리”

- 후보 A(선택): “고객사망등록” → **서비스명/도메인/DTO 모두 정합** → 높은 점수
- 후보 B(차선): “상속계좌처리” → **계좌 도메인 정합**(단계에 따라 2~3번째로 채택)
- 후보 C(탈락): “회계검증결과조회” → **도메인(accounting) 불일치** → 강한 감점/제외

#### 4-3) 불확실성 처리(중요)

아래면 “불확실”로 판단해 LLM 재질의 또는 후보 Top3를 제시하면 정확도가 올라갑니다.

- Top1 점수 낮음(예: 45점 미만)
- Top1–Top2 점수차가 작음(예: 7점 미만)
- 후보 도메인이 서로 다름(고객 vs 회계 등)

---

### 5) 테스트 케이스 생성/관리/실행(시나리오 이후)

시나리오가 “업무 흐름(단계)”라면, 테스트 케이스는 이를 **HTTP 테스트 단위**로 변환한 결과물입니다.

#### 5-1) 테스트 케이스 생성

- FINIX는 시나리오에 저장된 `steps`를 읽어 **단계별 테스트 케이스**를 생성합니다.
- 테스트 케이스에는 보통 아래가 포함됩니다.
  - method, endpoint, request_body(필요 시)
  - expected_status / expected_body (성공/실패 기준)

> 현재 버전은 단계(action/result) 기반 템플릿으로 케이스를 구성합니다.  
> 향후 OpenAPI/정책 메타가 붙으면 required/에러코드까지 더 정밀하게 생성할 수 있습니다.

#### 5-2) 관리(재생성/수정/내보내기)

- **재생성**: 같은 시나리오에서 다시 생성하면 “최신 단계”가 반영되도록 케이스를 재생성
- **수정**: 일부 필드(이름/메서드/endpoint/요청/기대값) 수정 가능
- **내보내기**: Postman 컬렉션으로 export 가능

#### 5-3) 실행과 이력

- 실행 결과(성공/실패, 메시지 등)를 저장하고 이력 조회가 가능합니다.
- 현재는 시뮬레이션 기반이며, 테스트 환경 연동 시 동일한 인터페이스로 확장 가능합니다.

---

### 6) 데이터 소스(현재)와 정확도 로드맵

#### 6-1) 현재(필수)

- `backend/cbs_srvc.json`: 서비스 코드/서비스명/HTTP 메서드/URI/DTO 등 카탈로그

#### 6-2) 정확도 향상(권장)

- **OpenAPI/JSON Schema**: required/응답/에러를 검증해 “호출 가능한 단계” 생성
- **업무/운영 메타(TX, 권한, 승인, 채널, 상태)**: “업무적으로 가능한 흐름” 검증

---

### 7) 비즈니스 밸리데이션(업무 규칙) 메타 운영 — 발표용 핵심

“DTO 입력값에 따라 에러가 달라지는” 규칙은 시나리오를 정밀하게 분기시키는 핵심입니다.  
베스트는 **소스에서 추출(릴리즈 단위) → 메타 레지스트리에 고정 → FINIX는 레지스트리만 참조**하는 방식입니다.

#### 7-1) 레지스트리 구조(예)

```
backend/
  cbs_srvc.json
  policy/
    validation/
      PY016.yaml
      AC011.yaml
      ...
```

#### 7-2) 릴리즈 운영(정답 패턴)

- 릴리즈마다 **자동 추출**로 변경 감지
- 변경된 서비스만 **PR diff**로 리뷰
- CI에서 정합성 검증(카탈로그 존재/스키마 required 만족 등)

---

### 8) 부록: 소스 기반 규칙 예시(PY016)

아래는 `PY016(Request bank salary payment)` 서비스 코드에서 확인되는 **입력 검증 규칙**을 메타로 옮기는 예시입니다.

- `pymntDt` 필수 → `AAPCME0006(@pymntDt)`
- `pymntDt > txDate` → `AAPCME0007(@pymntDt, txDate)`
- 날짜 포맷 유효 → `AAPCME0001(@pymntDt, pymntDt)`
- 휴일 불가 → `AAPCME0031`
- `pymntRmkCntnt`, `bsicAtchmntFileId`, `dtlAtchmntFileId` 필수 → `AAPCME0006`

메타(YAML) 예시(발표용 축약):

```yaml
service_code: "PY016"
service_name: "Request bank salary payment"
source_version: "cbs-release-2026.05.07"
rules:
  - rule_id: "PY016-NEG-001"
    description: "pymntDt is mandatory"
    when: { input: { pymntDt: null } }
    expect: { outcome: "error", http_status: 400, error_code: "AAPCME0006", error_args: ["@pymntDt"] }

  - rule_id: "PY016-NEG-010"
    description: "pymntDt must be larger than txDate"
    when: { input: { pymntDt: "<= txDate" }, preconditions: { txDate: "runtime(ServiceContext.getTxDate)" } }
    expect: { outcome: "error", http_status: 400, error_code: "AAPCME0007" }
```

> 참고: `arrSrvcCntr.validate(...)` 같은 도메인 검증은 내부 정책/상태 기반이라, 별도 정책 메타(Policy Registry) 또는 추가 추출이 필요합니다.

---

### 9) (제안) “규칙/메타 관리” 화면 예시 — PY016로 보는 편집 경험

FINIX를 운영하면서 규칙을 지속적으로 고치려면, 사이드바에 **`규칙/메타 관리`** 메뉴를 두고 아래처럼 보여주는 구성이 가장 이해하기 쉽습니다.

#### 9-1) 사이드바 메뉴(예)

- 새 테스트
- 테스트 이력
- 저장된 시나리오
- **규칙/메타 관리** ← (신규)

#### 9-2) 규칙/메타 관리 화면 구성(탭 3개)

- **Rule Editor(기본)**: 폼 기반 편집(일반 사용자/QA도 이해 가능)
- **YAML View(읽기 전용)**: 현재 규칙을 YAML로 확인/복사(파워유저)
- **History**: 변경 이력 + diff + 코멘트(승인/감사 목적)

#### 9-3) PY016 규칙을 “폼”으로 보여주면 이렇게 보입니다(예)

**Header**
- Service Code: `PY016`
- Service Name: `Request bank salary payment`
- Source Version: `cbs-release-2026.05.07`

**Rules**

- Rule `PY016-NEG-001`
  - Description: `pymntDt is mandatory`
  - When.input:
    - `pymntDt = null`
  - Expect:
    - outcome = `error`
    - http_status = `400`
    - error_code = `AAPCME0006`
    - error_args = `["@pymntDt"]`
  - Minimal Input(샘플):
    - `pymntDt = null`
    - `pymntRmkCntnt = "급여이체"`
    - `bsicAtchmntFileId = "file_basic_001"`
    - `dtlAtchmntFileId = "file_detail_001"`

- Rule `PY016-NEG-010`
  - Description: `pymntDt must be larger than txDate`
  - When.preconditions:
    - `txDate = runtime(ServiceContext.getTxDate)`
  - When.input:
    - `pymntDt <= txDate`
  - Expect:
    - outcome = `error`
    - http_status = `400`
    - error_code = `AAPCME0007`

> 포인트: 사용자는 YAML을 몰라도, “필드/조건/기대결과” 형태로 쉽게 수정할 수 있습니다.

#### 9-4) 같은 내용을 YAML로 보면 이렇게 보입니다(요약)

```yaml
service_code: "PY016"
service_name: "Request bank salary payment"
source_version: "cbs-release-2026.05.07"
rules:
  - rule_id: "PY016-NEG-001"
    description: "pymntDt is mandatory"
    when: { input: { pymntDt: null } }
    expect:
      outcome: "error"
      http_status: 400
      error_code: "AAPCME0006"
      error_args: ["@pymntDt"]
    minimal_input:
      pymntDt: null
      pymntRmkCntnt: "급여이체"
      bsicAtchmntFileId: "file_basic_001"
      dtlAtchmntFileId: "file_detail_001"

  - rule_id: "PY016-NEG-010"
    description: "pymntDt must be larger than txDate"
    when:
      preconditions: { txDate: "runtime(ServiceContext.getTxDate)" }
      input: { pymntDt: "<= txDate" }
    expect: { outcome: "error", http_status: 400, error_code: "AAPCME0007" }
```

#### 9-5) 저장/승인(운영 흐름) 예시

- Editor가 Rule을 수정하고 저장하면 **Draft** 상태로 저장
- 시스템이 즉시 Validation:
  - `service_code` 존재 여부(`cbs_srvc.json`)
  - 필수 필드(rule_id/when/expect) 누락 여부
- Approver가 diff 확인 후 **Approve → Active 반영**

---

### 9) AI(LLM) 사용 방식(한 장 요약)

- LLM은 “자연어 → 구조화된 intent”에 사용됩니다.
- LLM이 없어도 카탈로그 기반으로 동작합니다.
- 디버그 모드에서는 파이프라인 단계별 로그로 근거 추적이 가능합니다.

---

### 10) 용어 정리

- **시나리오(Scenario)**: 테스트하려는 업무 흐름을 단계로 정리한 것
- **단계(Step)**: 시나리오의 한 단계(서비스명/코드/근거 포함)
- **테스트 케이스(Test Case)**: HTTP 호출 단위의 테스트 정의
- **카탈로그(Catalog)**: 서비스 목록 메타데이터(`cbs_srvc.json`)
- **LLM**: 대화형 대규모 언어 모델(추론/구조화)


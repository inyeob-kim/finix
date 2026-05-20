# 시나리오 관리 (레지스트리)

경로: `/scenario-registry` (로그인 필요)

브라우저 **localStorage** 전용 워크스페이스. DB `scenarios`와 **별개**입니다.

## 화면 레이아웃

| 영역 | 설명 |
|------|------|
| 상단 툴바 | Export, Import, 폴더+, 검색, 필터, **등록** |
| 좌측 | 폴더 트리 (컬렉션) |
| 중앙 | 시나리오 테이블 |
| 우측 (선택) | 미리보기 Resizable 패널 |
| 상단 메트릭 | Total, AI %, Success %, Coverage % |

## Export / Import

### Export

1. **Export** 클릭
2. JSON Dialog — 전체 레지스트리 복사
3. 파일로 저장 → 팀 공유·백업

### Import

1. **Import** 클릭
2. JSON 붙여넣기
3. **저장** — 기존 localStorage 덮어쓰기 주의

## 폴더(컬렉션) 관리

1. **폴더+** 로 새 컬렉션
2. 트리에서 폴더 선택 → 해당 시나리오만 표시
3. 폴더 이름 편집·삭제 (Confirm)

## 시나리오 등록 마법사 (2단계)

**등록** 버튼으로 시작.

### 1단계 — 서비스 시퀀스

| UI | 설명 |
|----|------|
| 서비스 검색 | 카탈로그에서 추가 |
| 서비스 행 | DnD 순서 변경, 삭제 |
| 다음 | 2단계 이동 |

### 2단계 — 메타·규칙 TC

| 필드 | 설명 |
|------|------|
| 시나리오명 | 필수 |
| 설명 | 선택 |
| 태그 | 쉼표 구분 |
| 서비스별 TC | 풀 TC 또는 규칙 참조 pick |

**저장** → `persistRegistryState` → localStorage

## 목록 행 액션

| 버튼 | 동작 |
|------|------|
| 행 클릭 | 미리보기 패널 |
| Wand2 | `/test-case` registry 모드 — TC 생성/연결 |
| Play | history 링크 (Mock) |
| 편집 | 마법사 재진입 |
| 삭제 | ConfirmPopover |

## 테스트케이스 생성 (레지스트리 → `/test-case`)

1. Wand2 클릭
2. `navigate('/test-case', { state: { registry: ... } })`
3. pool TC 또는 ruleSelections 표시
4. **테스트케이스 생성** 시 백엔드 시나리오 + materialize 가능

## 시나리오 편집 (기존 항목)

등록 마법사를 **편집 모드**로 열림 — 1·2단계 동일, **저장** 시 덮어쓰기.

## 주의사항

- 홈 AI 시나리오가 여기 **자동 표시 안 됨**
- DB execution id와 레지스트리 Mock history id **불일치** 가능
- 실제 실행 검증은 DB 시나리오 + `/test-case/:id` 권장

## FAQ

### 레지스트리를 팀과 공유하려면?

Export JSON → Git/공유폴더 → Import

### Coverage %는 무엇인가?

UI 계산 메트릭 — 서비스 시퀀스 대비 규칙/TC 커버리지 추정값. 공식 문서는 코드 `calcCoverage` 참고.

# REST API 참조

Base URL: `/api/v1` (프론트 Vite 프록시: `/api` → `http://127.0.0.1:8000`)

JSON 요청·응답 예시: `docs/manual/12-api-examples.md`

---

## Scenarios

| Method | Path | 설명 |
|--------|------|------|
| POST | `/scenarios` | AI/휴리스틱 시나리오 생성 |
| GET | `/scenarios` | 목록 (`saved`, `limit`, `offset`) |
| GET | `/scenarios/{id}` | 단건 |
| PATCH | `/scenarios/{id}` | title, prompt, steps |
| POST | `/scenarios/{id}/save` | 저장 마커 |
| DELETE | `/scenarios/{id}/save` | 저장 해제 |
| POST | `/scenarios/{id}/save-definition` | steps·postman·per_step 일괄 저장 |
| GET | `/scenarios/{id}/test-cases` | 연결 TC |
| POST | `/scenarios/{id}/test-cases/generate` | 스텝→TC 생성 |
| POST | `/scenarios/{id}/attach-test-cases` | 풀 TC 연결 |
| POST | `/scenarios/suggest-bindings` | AI/heuristic inject·extract 제안 |
| POST | `/scenarios/resolve-preview` | 인라인 draft resolve |
| POST | `/scenarios/{id}/resolve-preview` | 저장 시나리오 resolve |
| GET | `/scenarios/{id}/export/postman` | Postman v2.1 (`resolved`, `native`) |

---

## Test cases

| Method | Path | 설명 |
|--------|------|------|
| GET | `/test-cases?service_code=` | 풀·시나리오 TC |
| GET | `/test-cases/{id}` | 단건 |
| PATCH | `/test-cases/{id}` | 수정 |
| GET | `/test-cases/{id}/export/postman` | 단건 Collection |
| POST | `/services/{code}/test-cases/materialize` | 적용된 YAML → TC 풀 |

---

## Executions

| Method | Path | 설명 |
|--------|------|------|
| POST | `/executions` | 시나리오 실행 (`mode`: simulate \| live) |
| GET | `/executions` | 이력 목록 (`created_from`, `created_to`, 페이징) |
| GET | `/executions/{id}` | 스텝별 expected/actual |

**POST body**

| 필드 | 타입 | 설명 |
|------|------|------|
| scenario_id | int | 필수 |
| base_url | string | Live 시 필수 |
| mode | string | `simulate`(기본) \| `live` |

---

## Service rules

| Method | Path | 설명 |
|--------|------|------|
| GET | `/service-rules/registry` | 서비스별 요약 (작업본/적용/이력 수) |
| GET | `/service-rules/{code}` | 현재 문서 (작업본 있으면 작업본) |
| GET | `/service-rules/{code}/versions` | 변경 이력 목록 |
| GET | `/service-rules/{code}/bundles/{id}` | 현재행 또는 이력 스냅샷 |
| POST | `/service-rules/{code}` | 작업본 upsert |
| PUT | `/service-rules/{code}/bundles/{id}` | 작업본 갱신 |
| POST | `/service-rules/{code}/validate-yaml` | 검증만 |
| POST | `/service-rules/{code}/generate-draft` | 메타 AI → 작업본 |
| POST | `/service-rules/{code}/generate-draft-from-source` | 소스 AI → 작업본 |
| POST | `/service-rules/{code}/{id}/activate` | **적용** (작업본 → 현재본) |
| POST | `/service-rules/{code}/rollback` | 이력 복원 (`to_version` = history_id) |
| DELETE | `/service-rules/{code}/bundles/{id}` | 이력 스냅샷 삭제 |

---

## Catalog, preview, manual

| Method | Path | 설명 |
|--------|------|------|
| GET | `/service-catalog` | 검색 |
| POST | `/service-catalog/import` | 파일 import |
| POST | `/service-catalog/import-json` | JSON import |
| GET | `/service-catalog/{code}` | 단건 |
| GET | `/service-catalog/{code}/dto-skeletons` | DTO 필드 스켈레톤 |
| GET | `/rules-yaml/{service_code}` | 적용된 YAML 미리보기 |
| GET | `/manual/status` | RAG 인덱스 checksum |
| POST | `/manual/reindex` | 임베딩 재구축 |
| POST | `/manual/chat` | RAG 질의 |

---

## HTTP 상태 코드 (자주 쓰는)

| 코드 | 상황 |
|------|------|
| 400 | 작업본만 있고 materialize, YAML 검증 실패, Live에 base_url 없음 |
| 404 | 시나리오·TC·이력 없음 |
| 422 | Pydantic 검증 |
| 500 | DB/LLM 내부 오류 (SUT 500은 execution `actual`에 기록) |

---

## 인증

현재 대부분 엔드포인트 **무인증**. 운영 배포 시 API Gateway·JWT 추가 권장.

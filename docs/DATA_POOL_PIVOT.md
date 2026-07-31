# Data Pool Pivot (Phase 1)

FINIX는 **Swagger + 거래로그 Data Pool** 중심으로 전환 중입니다.

## 화면

| 경로 | 설명 |
|------|------|
| `/data-pool` | Happy / Negative 샘플 브라우저 (기본 랜딩) |
| `/log-ingest` | 붙여넣기(보조) + 서버 Bulk(주력, Connector 추후) |
| `/openapi` | OpenAPI/Swagger import · operation 목록 |
| `/scenario-registry` | 시나리오 조립·실행 (유지) |
| `/history` | Runner 실행 이력 |
| `/rules` | YAML 규칙 레거시 |
| `/ai-scenario` | AI 시나리오 생성 (보조) |

## API

- `POST /api/v1/log-ingest/parse|commit|bulk`
- `GET /api/v1/data-pool/samples`
- `POST /api/v1/openapi/import`
- `GET /api/v1/openapi/documents|operations`

## Phase 2

- `POST /api/v1/data-pool/samples/{id}/promote` — Pool → TC 승격
- `POST /api/v1/data-pool/promote-by-service` — 서비스 단위 일괄 승격
- Live 실행 시 `runner_feedback`으로 Pool 재적재
- 시나리오 관리: Pool 샘플을 후보로 표시, 선택 시 자동 승격

## Phase 3

- `GET /api/v1/dashboard/overview` — Pool + Expected Error / Happy Replay KPI
- `GET /api/v1/log-ingest/bulk-status` + Filesystem / HTTP Bulk (`LOG_BULK_SOURCE_DIR`, `LOG_BULK_SOURCE_URL`)
- `GET /api/v1/data-pool/coverage` — Happy/Negative counts by `service_code`
- Happy-path Live runner: response body diff with `RESPONSE_DIFF_IGNORE_PATHS` / `response_diff_ignore_paths`
- TC API에 `pool_sample_id` 노출 → Registry 중복 후보 제거

```env
# backend/.env
LOG_BULK_SOURCE_DIR=C:/logs/finix-bxcm
LOG_BULK_SOURCE_URL=https://example.com/logs/dump.json
```

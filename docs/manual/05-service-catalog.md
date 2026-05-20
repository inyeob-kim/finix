# 서비스 카탈로그

## 개요

CBS 서비스 메타(코드, 이름, HTTP method, URI, 입력 필드)는 다음에서 옵니다.

- 파일: `backend/cbs_srvc.json` (약 900+ 서비스)
- DB: `service_catalog_items` (import 후)

카탈로그 없이도 규칙·TC는 동작할 수 있으나, **엔드포인트·필드 메타**가 부정확해질 수 있습니다.

---

## Import API (UI 버튼 없음)

| API | 설명 |
|-----|------|
| `POST /api/v1/service-catalog/import` | `CBS_SERVICE_JSON_PATH` 파일 → DB upsert |
| `POST /api/v1/service-catalog/import-json` | JSON body 직접 업로드 |
| `GET /api/v1/service-catalog?q=&limit=&offset=` | 검색·페이징 |
| `GET /api/v1/service-catalog/{service_code}` | 단건 |

### 운영 예시

```bash
curl -X POST http://127.0.0.1:8000/api/v1/service-catalog/import
```

```bash
curl "http://127.0.0.1:8000/api/v1/service-catalog?q=PY027&limit=10"
```

import 후 `/rules`, `/test-cases`의 **ServiceCatalogCombobox**에 반영됩니다.

### import-json (부분 갱신)

```json
{
  "items": [
    {
      "service_code": "PY027",
      "service_name": "출금",
      "http_method": "POST",
      "uri": "/api/v1/withdraw",
      "input_fields": []
    }
  ]
}
```

---

## 소비처

| 기능 | 사용 방식 |
|------|-----------|
| AI 시나리오 | 프롬프트 키워드 → `search_by_prompt` |
| 규칙 YAML AI | 서비스명·필드 스냅샷 in prompt |
| TC materialize | method, uri → `request_body` 템플릿 |
| UI 콤보박스 | debounce 검색, 최대 50건 |

---

## 카탈로그 없는 서비스 코드

- materialize 시 endpoint 기본값: `/services/{code}`
- Postman export URI 확인 필요
- 운영 전 **import + 단건 GET** 으로 URI 검증

---

## 트러블슈팅

| 증상 | 조치 |
|------|------|
| 콤보박스에 서비스 안 나옴 | import 실행, `q` 검색어 2자 이상 |
| AI가 잘못된 코드 제안 | 카탈로그 최신화, 프롬프트에 코드 명시 |
| TC URI가 실 SUT와 다름 | 카탈로그 `uri` 수정 후 TC 재생성 |

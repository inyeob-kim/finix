# 매뉴얼 RAG 운영

## 인덱스 대상 파일

- `docs/FINIX_MANUAL.md` (개요·아키텍처)
- `docs/manual/*.md` (챕터 전부, 예: `14-scenario-bindings-and-postman.md`)

**대규모 기능 변경 후**(Live 실행, 배치 결과, 이력 API, 바인딩 등) 반드시 재인덱싱하세요.

환경 변수:

- `MANUAL_MD_PATH` — 메인 파일 경로
- `MANUAL_DOCS_DIR` — 챕터 디렉터리 (기본 `docs/manual`)

## Chunking 규칙

- Markdown `#` ~ `###` 헤더마다 섹션 분리
- chunk 제목: `{파일명} > {헤더 경로}`
- embedding: OpenAI 호환 `LLM_EMBEDDING_MODEL` (기본 `text-embedding-3-small`)

## 재인덱싱 시점

| 시점 | 방법 |
|------|------|
| 문서 수정 후 | `POST /api/v1/manual/reindex` |
| 첫 채팅 질문 | checksum 변경 시 자동 |
| 배포 파이프라인 | `python backend/scripts/reindex_manual.py` |

## 상태 확인

```http
GET /api/v1/manual/status
```

```json
{
  "indexed": true,
  "chunk_count": 85,
  "source_checksum": "a1b2...",
  "source_path": "FINIX_MANUAL.md; 01-getting-started.md; ..."
}
```

## 문서 작성 팁 (검색 품질)

1. FAQ 제목에 사용자 질문 문장 그대로 사용
2. 메뉴 경로 `/rules` 를 본문에 명시
3. 「YAML 등록」「Live 실행」「execution-batch」「AAPCME0072」 등 키워드 반복
4. 한 섹션은 하나의 주제만 (헤더 단위 chunk)

## 스크립트

```bash
cd backend
python scripts/reindex_manual.py
```

`LLM_API_KEY`와 DB 연결 필요.

### Embedding 프로바이더 (중요)

매뉴얼 RAG 임베딩은 **OpenAI 호환 `/embeddings`** 가 필요합니다. `LLM_PROVIDER=anthropic` 만 설정된 경우 reindex가 실패합니다.

| 설정 | 설명 |
|------|------|
| `LLM_PROVIDER=openai` | chat + embedding 동일 키 |
| `LLM_EMBEDDING_API_KEY` | Anthropic chat + OpenAI embedding 분리 시 |
| `LLM_EMBEDDING_BASE_URL` | 임베딩 전용 엔드포인트 (선택) |

```bash
# 예: Windows PowerShell (세션 한정)
$env:LLM_PROVIDER="openai"
cd backend
python scripts/reindex_manual.py
```

또는 UI/ API: `POST /api/v1/manual/reindex` (동일 키 요구).

## 문제 해결

| 증상 | 조치 |
|------|------|
| 「매뉴얼에 없다」 | reindex, 질문에 메뉴명 포함 |
| 오래된 답변 | 문서 수정 후 reindex |
| embedding 오류 | API 키·모델명·네트워크 확인 |

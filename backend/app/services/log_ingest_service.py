"""Business logic: parse transaction logs and commit to the data pool."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.core.exceptions import InvalidInputError
from app.core.logger import get_logger
from app.domain.bxcm_log.models import ParsedExchange
from app.domain.bxcm_log.parser import parse_log_text
from app.models.fnx_pool_sample import PoolSample
from app.repositories.pool_sample_repo import PoolSampleRepository
from app.utils.json_text import dumps_json

logger = get_logger(__name__)


def fingerprint_for_exchange(ex: ParsedExchange, *, source: str) -> str:
    payload = {
        "method": ex.method,
        "endpoint": ex.endpoint,
        "http_status": ex.http_status,
        "biz_error_code": ex.biz_error_code,
        "request_body": ex.request_body,
        "path_kind": ex.path_kind,
        "source": source,
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def exchange_to_sample(ex: ParsedExchange, *, source: str) -> PoolSample:
    return PoolSample(
        service_code=ex.service_code,
        method=ex.method,
        endpoint=ex.endpoint,
        path_kind=ex.path_kind,
        http_status=ex.http_status,
        biz_error_code=ex.biz_error_code,
        cbb_header_json=dumps_json(ex.cbb_header) if ex.cbb_header else None,
        request_body_json=dumps_json(ex.request_body) if ex.request_body is not None else None,
        response_body_json=(
            dumps_json(ex.response_body) if ex.response_body is not None else None
        ),
        source=source,
        source_fingerprint=fingerprint_for_exchange(ex, source=source),
        quality_score=0.0,
    )


def mapping_to_exchange(raw: dict[str, Any]) -> ParsedExchange:
    from app.domain.bxcm_log.parser import exchange_from_mapping

    return exchange_from_mapping(raw)


class LogIngestService:
    """Parse and commit log exchanges into pool_samples."""

    def __init__(self, pool_repo: PoolSampleRepository) -> None:
        self._pool = pool_repo

    def parse(self, text: str) -> list[ParsedExchange]:
        exchanges = parse_log_text(text)
        logger.info("Parsed log text", extra={"exchange_count": len(exchanges)})
        return exchanges

    async def commit_exchanges(
        self,
        exchanges: list[ParsedExchange],
        *,
        source: str,
    ) -> dict[str, Any]:
        if not exchanges:
            raise InvalidInputError("적재할 거래 교환(exchange)이 없습니다.")
        created = 0
        updated = 0
        ids: list[int] = []
        for ex in exchanges:
            sample, was_created = await self._pool.upsert(
                exchange_to_sample(ex, source=source),
            )
            ids.append(sample.id)
            if was_created:
                created += 1
            else:
                updated += 1
        logger.info(
            "Committed pool samples",
            extra={"created": created, "updated": updated, "source": source},
        )
        return {
            "created": created,
            "updated": updated,
            "total": created + updated,
            "sample_ids": ids,
        }

    async def commit_from_text(self, text: str, *, source: str) -> dict[str, Any]:
        return await self.commit_exchanges(self.parse(text), source=source)

    async def bulk_status(self) -> dict[str, Any]:
        from app.core.config import get_settings

        settings = get_settings()
        directory = (settings.log_bulk_source_dir or "").strip() or None
        url = (settings.log_bulk_source_url or "").strip() or None
        file_count = 0
        dir_ok = False
        if directory:
            from pathlib import Path

            from app.domain.bxcm_log.sources.filesystem import SUPPORTED_SUFFIXES

            root = Path(directory)
            if root.is_dir():
                dir_ok = True
                file_count = sum(
                    1
                    for p in root.iterdir()
                    if p.is_file() and p.suffix.lower() in SUPPORTED_SUFFIXES
                )
        configured = dir_ok or bool(url)
        parts: list[str] = []
        if dir_ok:
            parts.append(f"dir={directory} ({file_count} files)")
        elif directory:
            parts.append(f"dir={directory} (missing)")
        if url:
            parts.append(f"url={url}")
        message = (
            "Bulk 소스: " + " · ".join(parts)
            if configured
            else (
                "Bulk Connector 미설정. LOG_BULK_SOURCE_DIR 또는 LOG_BULK_SOURCE_URL 을 "
                "설정하거나 로그 덤프를 붙여넣으세요."
            )
        )
        return {
            "configured": configured,
            "directory": directory,
            "url": url,
            "file_count": file_count,
            "message": message,
        }

    async def bulk_ingest(
        self,
        *,
        log_text: str | None,
        service_code: str | None,
    ) -> dict[str, Any]:
        """
        Bulk path priority:
        1) explicit log_text
        2) LOG_BULK_SOURCE_DIR
        3) LOG_BULK_SOURCE_URL
        4) not_configured
        """
        text = (log_text or "").strip()
        source_label = "server_bulk"
        if not text:
            from app.core.config import get_settings

            settings = get_settings()
            directory = (settings.log_bulk_source_dir or "").strip()
            url = (settings.log_bulk_source_url or "").strip()
            if directory:
                try:
                    from app.domain.bxcm_log.sources.filesystem import (
                        read_bulk_log_directory,
                    )

                    text = read_bulk_log_directory(directory)
                except FileNotFoundError:
                    if not url:
                        return {
                            "status": "not_configured",
                            "message": f"Bulk 디렉터리를 찾을 수 없습니다: {directory}",
                            "commit": None,
                        }
            if not text.strip() and url:
                try:
                    from app.domain.bxcm_log.sources.http_url import fetch_bulk_log_url

                    text = fetch_bulk_log_url(url)
                except Exception as exc:  # noqa: BLE001
                    return {
                        "status": "not_configured",
                        "message": f"Bulk URL 수집 실패: {exc}",
                        "commit": None,
                    }
            if not text.strip() and (directory or url):
                return {
                    "status": "empty",
                    "message": "Bulk 소스에서 읽을 로그가 없습니다.",
                    "commit": None,
                }

        if text:
            exchanges = self.parse(text)
            if service_code and service_code.strip():
                code = service_code.strip()
                for ex in exchanges:
                    if not ex.service_code:
                        ex.service_code = code
                        ex.cbb_header.setdefault("srvcCd", code)
            if not exchanges:
                return {
                    "status": "empty",
                    "message": "Bulk 입력에서 파싱된 거래가 없습니다.",
                    "commit": None,
                }
            commit = await self.commit_exchanges(exchanges, source=source_label)
            return {
                "status": "ok",
                "message": f"Bulk에서 {commit['total']}건을 Data Pool에 반영했습니다.",
                "commit": commit,
            }
        return {
            "status": "not_configured",
            "message": (
                "서버 Bulk Connector가 아직 연결되지 않았습니다. "
                "LOG_BULK_SOURCE_DIR / LOG_BULK_SOURCE_URL 을 설정하거나 로그 덤프를 붙여넣으세요."
            ),
            "commit": None,
        }

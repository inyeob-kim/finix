"""Bulk log source adapters."""

from app.domain.bxcm_log.sources.filesystem import read_bulk_log_directory
from app.domain.bxcm_log.sources.http_url import fetch_bulk_log_url

__all__ = ["read_bulk_log_directory", "fetch_bulk_log_url"]

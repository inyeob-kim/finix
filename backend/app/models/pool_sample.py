"""SQLAlchemy model for Happy / Negative API data-pool samples."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PoolSample(Base):
    """One captured request/response pair used as replay / expected-error seed data."""

    __tablename__ = "pool_samples"
    __table_args__ = (
        UniqueConstraint("source_fingerprint", name="uq_pool_samples_fingerprint"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    api_operation_id: Mapped[int | None] = mapped_column(
        ForeignKey("api_operations.id", ondelete="SET NULL"),
        nullable=True,
    )
    service_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    method: Mapped[str] = mapped_column(String(16), nullable=False, server_default="POST")
    endpoint: Mapped[str] = mapped_column(String(512), nullable=False, server_default="/")
    path_kind: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    biz_error_code: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    cbb_header_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_body_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_body_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, server_default="paste")
    source_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    quality_score: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

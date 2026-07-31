"""SQLAlchemy models for imported OpenAPI documents and operations."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OpenApiDocument(Base):
    """One imported OpenAPI / Swagger document."""

    __tablename__ = "openapi_documents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class ApiOperation(Base):
    """Normalized HTTP operation from OpenAPI, optionally linked to CBS service_code."""

    __tablename__ = "api_operations"
    __table_args__ = (
        UniqueConstraint("method", "path", name="uq_api_operations_method_path"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    openapi_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("openapi_documents.id", ondelete="SET NULL"),
        nullable=True,
    )
    service_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    method: Mapped[str] = mapped_column(String(16), nullable=False)
    path: Mapped[str] = mapped_column(String(512), nullable=False)
    operation_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[str | None] = mapped_column(String(512), nullable=True)
    request_schema_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_schema_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

"""SQLAlchemy model for service catalog items (imported from CBS JSON)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ServiceCatalogItem(Base):
    """Normalized service metadata used for generation and lookups."""

    __tablename__ = "service_catalog_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    service_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    service_name: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    http_method: Mapped[str] = mapped_column(String(16), nullable=False, server_default="")
    uri: Mapped[str] = mapped_column(String(512), nullable=False, server_default="")

    tags_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    source: Mapped[str] = mapped_column(String(64), nullable=False, server_default="cbs_srvc.json")
    source_version: Mapped[str | None] = mapped_column(String(128), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


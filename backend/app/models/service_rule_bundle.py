"""SQLAlchemy model for versioned YAML rule bundles (DB primary)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ServiceRuleBundle(Base):
    """One version of rules for a given service_code."""

    __tablename__ = "service_rule_bundles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    service_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    service_name_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)

    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="draft")
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    source_version: Mapped[str | None] = mapped_column(String(128), nullable=True)

    yaml_text: Mapped[str] = mapped_column(Text, nullable=False)
    rules_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)

    created_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


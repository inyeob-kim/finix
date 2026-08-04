"""SQLAlchemy model: one applied YAML document per service_code."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ServiceRuleCurrent(Base):
    """Applied rules for a service, plus optional working draft."""

    __tablename__ = "service_rules_current"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    service_code: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    service_name_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_version: Mapped[str | None] = mapped_column(String(128), nullable=True)

    yaml_text: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    rules_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")

    draft_yaml_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_rules_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    draft_source_version: Mapped[str | None] = mapped_column(String(128), nullable=True)
    draft_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    draft_updated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)

    updated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    @property
    def has_draft(self) -> bool:
        return bool((self.draft_yaml_text or "").strip())

    @property
    def has_applied(self) -> bool:
        return bool((self.yaml_text or "").strip()) and bool((self.checksum or "").strip())

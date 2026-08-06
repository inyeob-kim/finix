"""SQLAlchemy model: immutable YAML snapshots (change history)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.domain.inst_scope import DEFAULT_INST_CD


class ServiceRuleHistory(Base):
    """Point-in-time snapshot of applied YAML (façade history)."""

    __tablename__ = "fnx_rule_doc_hist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    inst_cd: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=DEFAULT_INST_CD, index=True
    )
    service_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    service_name_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_version: Mapped[str | None] = mapped_column(String(128), nullable=True)

    yaml_text: Mapped[str] = mapped_column(Text, nullable=False)
    rules_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)

    change_kind: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default="apply"
    )
    note: Mapped[str | None] = mapped_column(String(512), nullable=True)

    created_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

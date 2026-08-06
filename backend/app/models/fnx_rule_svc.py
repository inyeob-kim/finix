"""SQLAlchemy model: service-level rules header + YAML façade (fnx_)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKeyConstraint, PrimaryKeyConstraint, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.domain.inst_scope import DEFAULT_INST_CD


class FnxRuleSvc(Base):
    """One row per (inst_cd, svc_code); mirrors service_rules_current for dual-write."""

    __tablename__ = "fnx_rule_svc"
    __table_args__ = (
        PrimaryKeyConstraint("inst_cd", "svc_code"),
        ForeignKeyConstraint(
            ["inst_cd"],
            ["fnx_inst.inst_cd"],
            ondelete="RESTRICT",
        ),
    )

    inst_cd: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=DEFAULT_INST_CD, index=True
    )
    svc_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
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

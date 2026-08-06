"""SQLAlchemy model: one YAML rule case row per (inst_cd, svc_code, rule_case_id)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKeyConstraint,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.domain.inst_scope import DEFAULT_INST_CD


class FnxRuleCase(Base):
    """Applied + optional draft fields for a single rule case."""

    __tablename__ = "fnx_rule_case"
    __table_args__ = (
        PrimaryKeyConstraint("inst_cd", "svc_code", "rule_case_id"),
        ForeignKeyConstraint(
            ["inst_cd", "svc_code"],
            ["fnx_rule_svc.inst_cd", "fnx_rule_svc.svc_code"],
            ondelete="CASCADE",
        ),
    )

    inst_cd: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=DEFAULT_INST_CD, index=True
    )
    svc_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    rule_case_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    rule_type: Mapped[str] = mapped_column(String(1), nullable=False, server_default="N")
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    expect_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    assertions_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # extract / use and other non-column YAML keys
    extra_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    folder: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    checksum: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")

    draft_input_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_expect_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_assertions_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_tags_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_evidence_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_extra_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_rule_type: Mapped[str | None] = mapped_column(String(1), nullable=True)
    draft_folder: Mapped[str | None] = mapped_column(String(128), nullable=True)
    draft_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
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
        return bool((self.draft_checksum or "").strip())

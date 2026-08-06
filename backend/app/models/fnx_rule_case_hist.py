"""SQLAlchemy model: immutable per-case rule snapshots."""

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


class FnxRuleCaseHist(Base):
    """Point-in-time snapshot of one fnx_rule_case."""

    __tablename__ = "fnx_rule_case_hist"
    __table_args__ = (
        PrimaryKeyConstraint("inst_cd", "svc_code", "rule_case_id", "version"),
        ForeignKeyConstraint(
            ["inst_cd", "svc_code", "rule_case_id"],
            [
                "fnx_rule_case.inst_cd",
                "fnx_rule_case.svc_code",
                "fnx_rule_case.rule_case_id",
            ],
            ondelete="CASCADE",
        ),
    )

    inst_cd: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=DEFAULT_INST_CD, index=True
    )
    svc_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    rule_case_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    change_kind: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default="apply"
    )
    snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    note: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

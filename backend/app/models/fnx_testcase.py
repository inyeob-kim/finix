"""SQLAlchemy model: HTTP test case current row (1:1 with fnx_rule_case)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.domain.inst_scope import DEFAULT_INST_CD


class FnxTestcase(Base):
    """Latest materialized HTTP definition for one rule case (or pool promote)."""

    __tablename__ = "fnx_testcase"
    __table_args__ = (PrimaryKeyConstraint("inst_cd", "svc_code", "rule_case_id"),)

    inst_cd: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=DEFAULT_INST_CD, index=True
    )
    svc_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    rule_case_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    http_method: Mapped[str | None] = mapped_column(String(16), nullable=True)
    endpoint: Mapped[str | None] = mapped_column(String(512), nullable=True)
    request_body_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expected_body_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    assertions_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    rule_case_hist_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")
    pool_sample_id: Mapped[int | None] = mapped_column(
        ForeignKey("fnx_pool_sample.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

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

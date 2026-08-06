"""SQLAlchemy model for a grouped execution (multi-step)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.domain.inst_scope import DEFAULT_INST_CD


class ExecutionRun(Base):
    """Parent row for one execution session (multiple step results)."""

    __tablename__ = "fnx_execution_run"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    inst_cd: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=DEFAULT_INST_CD, index=True
    )
    scenario_id: Mapped[int | None] = mapped_column(
        ForeignKey("fnx_scenario.id", ondelete="SET NULL"),
        nullable=True,
    )
    base_url: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    summary_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    execution_step_results: Mapped[list[ExecutionStepResult]] = relationship(
        "ExecutionStepResult",
        back_populates="execution_run",
        cascade="all, delete-orphan",
    )

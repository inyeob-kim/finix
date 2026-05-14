"""SQLAlchemy model for a grouped execution (multi-step)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ExecutionRun(Base):
    """Parent row for one execution session (multiple step results)."""

    __tablename__ = "execution_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scenario_id: Mapped[int | None] = mapped_column(
        ForeignKey("scenarios.id", ondelete="SET NULL"),
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

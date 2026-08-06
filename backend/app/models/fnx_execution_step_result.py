"""SQLAlchemy model for per-step execution outcomes."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ExecutionStepResult(Base):
    """One row per scenario/API step inside an execution run."""

    __tablename__ = "fnx_execution_step_result"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    execution_run_id: Mapped[int] = mapped_column(
        ForeignKey("fnx_execution_run.id", ondelete="CASCADE"),
        nullable=False,
    )
    step_index: Mapped[int] = mapped_column(Integer, nullable=False)
    step_label: Mapped[str] = mapped_column(String(512), nullable=False)
    # Natural-key link to fnx_testcase.
    inst_cd: Mapped[str] = mapped_column(String(16), nullable=False)
    svc_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rule_case_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tc_hist_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    expected_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    actual_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    execution_run: Mapped[ExecutionRun] = relationship(
        "ExecutionRun",
        back_populates="execution_step_results",
    )

"""SQLAlchemy model for per-step execution outcomes."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ExecutionStepResult(Base):
    """One row per scenario/API step inside an execution run."""

    __tablename__ = "execution_step_results"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    execution_run_id: Mapped[int] = mapped_column(
        ForeignKey("execution_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    step_index: Mapped[int] = mapped_column(Integer, nullable=False)
    step_label: Mapped[str] = mapped_column(String(512), nullable=False)
    testcase_id: Mapped[int | None] = mapped_column(
        ForeignKey("testcases.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    expected_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    actual_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    execution_run: Mapped[ExecutionRun] = relationship(
        "ExecutionRun",
        back_populates="execution_step_results",
    )

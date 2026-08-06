"""SQLAlchemy model for persisted execution outcomes."""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.domain.inst_scope import DEFAULT_INST_CD


class ExecutionLog(Base):
    """Record of a single test execution run (natural-key TC reference)."""

    __tablename__ = "fnx_execution_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    inst_cd: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=DEFAULT_INST_CD, index=True
    )
    svc_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rule_case_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

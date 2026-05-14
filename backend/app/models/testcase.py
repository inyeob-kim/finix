"""SQLAlchemy model for test cases."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TestCase(Base):
    """Persisted test case linked to an optional scenario."""

    __tablename__ = "testcases"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scenario_id: Mapped[int | None] = mapped_column(
        ForeignKey("scenarios.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    steps: Mapped[str | None] = mapped_column(Text, nullable=True)
    http_method: Mapped[str | None] = mapped_column(String(16), nullable=True)
    endpoint: Mapped[str | None] = mapped_column(String(512), nullable=True)
    request_body_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expected_body_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    step_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rule_bundle_id: Mapped[int | None] = mapped_column(
        ForeignKey("service_rule_bundles.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

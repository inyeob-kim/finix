"""SQLAlchemy model for active/approved rule bundle pointers."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ServiceRulePointer(Base):
    """Fast lookup table for which bundle is active per service."""

    __tablename__ = "service_rule_pointers"

    service_code: Mapped[str] = mapped_column(String(64), primary_key=True)
    active_bundle_id: Mapped[int | None] = mapped_column(
        ForeignKey("service_rule_bundles.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_bundle_id: Mapped[int | None] = mapped_column(
        ForeignKey("service_rule_bundles.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


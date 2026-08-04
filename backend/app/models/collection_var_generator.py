"""ORM model for shared collection-variable generators."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CollectionVarGenerator(Base):
    """Team-shared dynamic value generator for scenario collection vars."""

    __tablename__ = "collection_var_generators"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Stable id referenced by start_vars.generator
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # builtin_param | date_offset | random_digits | uuid_ref | korean_name_ref | korean_rrn_ref
    impl_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    impl_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    # draft | active
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active", index=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

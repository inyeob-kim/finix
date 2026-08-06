"""SQLAlchemy model for external service registry entries."""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.domain.inst_scope import DEFAULT_INST_CD


class RegisteredService(Base):
    """Registered integration or runner endpoint."""

    __tablename__ = "fnx_registered_service"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    inst_cd: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=DEFAULT_INST_CD, index=True
    )
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)

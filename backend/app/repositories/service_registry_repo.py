"""Async data access for registered external services (URLs, names)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.registered_service import RegisteredService


class ServiceRegistryRepository:
    """Repository for discovering runner or integration endpoints."""

    def __init__(self, session: AsyncSession) -> None:
        """
        Initialize the repository with a database session.

        Args:
            session: Active async SQLAlchemy session.
        """
        self._session = session

    async def ensure_default_runner_stub(self) -> None:
        """
        Insert a placeholder runner entry if the registry is empty.

        This supports local development without manual seed data.
        """
        result = await self._session.execute(select(RegisteredService.id).limit(1))
        if result.scalar_one_or_none() is not None:
            return
        stub = RegisteredService(
            name="default-runner",
            base_url="http://localhost:0/stub",
        )
        self._session.add(stub)
        await self._session.flush()

    async def list_services(self) -> list[RegisteredService]:
        """
        Return all registered services ordered by id.

        Returns:
            List of RegisteredService rows.
        """
        result = await self._session.execute(
            select(RegisteredService).order_by(RegisteredService.id)
        )
        return list(result.scalars().all())

    async def get_by_name(self, name: str) -> RegisteredService | None:
        """
        Find a service by unique name.

        Args:
            name: Registry name key.

        Returns:
            RegisteredService if found, else None.
        """
        result = await self._session.execute(
            select(RegisteredService).where(RegisteredService.name == name)
        )
        return result.scalar_one_or_none()

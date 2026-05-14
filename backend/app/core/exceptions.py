"""Domain-level errors independent of HTTP frameworks."""


class DomainError(Exception):
    """Base class for predictable business rule violations."""


class EntityNotFoundError(DomainError):
    """Raised when a referenced aggregate or entity does not exist."""

    def __init__(self, entity: str, identifier: int | str) -> None:
        self.entity = entity
        self.identifier = identifier
        super().__init__(f"{entity} not found: {identifier!r}")


class InvalidInputError(DomainError):
    """Raised when domain inputs fail validation beyond Pydantic boundaries."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)

"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _default_sqlite_url() -> str:
    """Resolve SQLite file under ``backend/`` regardless of process cwd."""
    db_path = _BACKEND_ROOT / "fcc_test_automation.db"
    return f"sqlite+aiosqlite:///{db_path.as_posix()}"


class Settings(BaseSettings):
    """Runtime settings for the API and database."""

    model_config = SettingsConfigDict(
        env_file=str(_BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "FINIX API"
    debug: bool = False
    log_level: str = Field(
        default="INFO",
        description="Root log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).",
    )
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    database_url: str = Field(default_factory=_default_sqlite_url)
    database_url_sync: str | None = Field(
        default=None,
        description="Optional sync DB URL used by Alembic (e.g. mysql+pymysql://...).",
    )
    cbs_service_json_path: str = Field(
        default=str(_BACKEND_ROOT / "cbs_srvc.json"),
        description="Path to CBS service catalog JSON used for scenario generation.",
    )

    # --- LLM (optional; consumed when AI features are wired) ---
    llm_provider: str = Field(
        default="openai",
        description="Provider id, e.g. openai, anthropic, azure_openai.",
    )
    llm_model: str = Field(
        default="gpt-4o-mini",
        description="Model or deployment name passed to the provider SDK.",
    )
    llm_api_key: SecretStr | None = Field(
        default=None,
        description="API key. Prefer env file or secret manager; never commit real keys.",
    )
    llm_base_url: str | None = Field(
        default=None,
        description="Optional base URL for OpenAI-compatible or proxy endpoints.",
    )
    llm_temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=2.0,
        description="Sampling temperature for chat completions where applicable.",
    )


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()

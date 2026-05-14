from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Ensure models are imported so Base.metadata is populated.
from app.db.base import Base  # noqa: E402
from app.models import (  # noqa: F401,E402
    execution_log,
    execution_run,
    execution_step_result,
    registered_service,
    scenario,
    testcase,
)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _resolve_url() -> str:
    """
    Prefer DATABASE_URL_SYNC (sync driver) when set.
    Fallback to DATABASE_URL but try to de-async it for Alembic.
    """
    url = (os.getenv("DATABASE_URL_SYNC") or "").strip()
    if url:
        return url

    url = (os.getenv("DATABASE_URL") or "").strip()
    if not url:
        # Keep a safe default (SQLite file), same as app settings.
        return "sqlite:///./fcc_test_automation.db"

    # If user passed an async URL, try to switch it to a sync driver.
    url = url.replace("sqlite+aiosqlite:///", "sqlite:///")
    url = url.replace("mysql+asyncmy://", "mysql+pymysql://")
    url = url.replace("mysql+aiomysql://", "mysql+pymysql://")
    return url


def run_migrations_offline() -> None:
    url = _resolve_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = _resolve_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()


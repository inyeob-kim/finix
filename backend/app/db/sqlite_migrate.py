"""Best-effort SQLite column additions for existing databases."""

from __future__ import annotations

from collections.abc import Callable

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection


def _add_column_if_missing(
    connection: Connection,
    table: str,
    column: str,
    ddl_suffix: str,
) -> None:
    """Execute ALTER TABLE ADD COLUMN when the column is absent."""
    insp = inspect(connection)
    if table not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns(table)}
    if column in existing:
        return
    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_suffix}"))


def apply_sqlite_migrations(connection: Connection) -> None:
    """
    Apply additive migrations for SQLite (create_all does not alter tables).

    Args:
        connection: Synchronous SQLAlchemy connection.
    """
    dialect = connection.dialect.name
    if dialect != "sqlite":
        return
    steps: list[Callable[[Connection], None]] = [
        lambda c: _add_column_if_missing(c, "scenarios", "prompt", "TEXT"),
        lambda c: _add_column_if_missing(c, "scenarios", "steps_json", "TEXT"),
        lambda c: _add_column_if_missing(c, "scenarios", "is_saved", "INTEGER NOT NULL DEFAULT 0"),
        lambda c: _add_column_if_missing(c, "testcases", "http_method", "VARCHAR(16)"),
        lambda c: _add_column_if_missing(c, "testcases", "endpoint", "VARCHAR(512)"),
        lambda c: _add_column_if_missing(c, "testcases", "request_body_json", "TEXT"),
        lambda c: _add_column_if_missing(c, "testcases", "expected_status", "INTEGER"),
        lambda c: _add_column_if_missing(c, "testcases", "expected_body_json", "TEXT"),
        lambda c: _add_column_if_missing(c, "testcases", "step_index", "INTEGER"),
    ]
    for step in steps:
        step(connection)

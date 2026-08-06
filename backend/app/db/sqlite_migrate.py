"""Best-effort SQLite column additions / fnx_ rebuild for existing databases."""

from __future__ import annotations

from collections.abc import Callable

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from app.domain.inst_scope import DEFAULT_INST_CD


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


def _fnx_needs_rebuild(connection: Connection) -> bool:
    """True when legacy surrogate-id fnx_rule_svc exists."""
    insp = inspect(connection)
    tables = set(insp.get_table_names())
    if "fnx_rule_svc" not in tables:
        return False
    cols = {c["name"] for c in insp.get_columns("fnx_rule_svc")}
    return "id" in cols or "inst_cd" not in cols


def _rebuild_fnx_natural_keys(connection: Connection) -> None:
    """Drop legacy fnx_* and let create_all recreate on next boot if needed.

    Here we only drop; Base.metadata.create_all in session startup recreates.
    """
    if not _fnx_needs_rebuild(connection):
        return
    for name in ("fnx_rule_case_hist", "fnx_rule_case", "fnx_rule_svc"):
        connection.execute(text(f"DROP TABLE IF EXISTS {name}"))


def apply_sqlite_migrations(connection: Connection) -> None:
    """
    Apply additive migrations for SQLite (create_all does not alter tables).

    Args:
        connection: Synchronous SQLAlchemy connection.
    """
    dialect = connection.dialect.name
    if dialect != "sqlite":
        return
    _rebuild_fnx_natural_keys(connection)
    steps: list[Callable[[Connection], None]] = [
        lambda c: _add_column_if_missing(c, "fnx_scenario", "prompt", "TEXT"),
        lambda c: _add_column_if_missing(c, "fnx_scenario", "steps_json", "TEXT"),
        lambda c: _add_column_if_missing(
            c, "fnx_scenario", "is_saved", "INTEGER NOT NULL DEFAULT 0"
        ),
    ]
    for step in steps:
        step(connection)

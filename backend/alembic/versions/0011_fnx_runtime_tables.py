"""Rename runtime tables to fnx_* and add inst_cd.

Revision ID: 0011_fnx_runtime_tables
Revises: 0010_fnx_testcase_natural
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011_fnx_runtime_tables"
down_revision = "0010_fnx_testcase_natural"
branch_labels = None
depends_on = None

DEFAULT_INST_CD = "1001"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _rename(old: str, new: str) -> None:
    if old in _tables() and new not in _tables():
        op.rename_table(old, new)


def _ensure_inst_cd(table: str, *, not_null: bool = True) -> None:
    if table not in _tables():
        return
    cols = _columns(table)
    if "inst_cd" not in cols:
        op.add_column(table, sa.Column("inst_cd", sa.String(16), nullable=True))
    bind = op.get_bind()
    bind.execute(
        sa.text(
            f"UPDATE {table} SET inst_cd = CAST(:cd AS varchar(16)) "
            "WHERE inst_cd IS NULL OR TRIM(inst_cd) = ''"
        ),
        {"cd": DEFAULT_INST_CD},
    )
    if not_null:
        op.alter_column(table, "inst_cd", nullable=False, server_default=DEFAULT_INST_CD)
    # Index + FK if missing
    idxs = {ix["name"] for ix in sa.inspect(bind).get_indexes(table) if ix.get("name")}
    ix_name = f"ix_{table}_inst_cd"
    if ix_name not in idxs:
        op.create_index(ix_name, table, ["inst_cd"])
    fks = {fk.get("name") for fk in sa.inspect(bind).get_foreign_keys(table) if fk.get("name")}
    fk_name = f"fk_{table}_inst"
    if fk_name not in fks and "fnx_inst" in _tables():
        op.create_foreign_key(
            fk_name, table, "fnx_inst", ["inst_cd"], ["inst_cd"], ondelete="RESTRICT"
        )


def upgrade() -> None:
    _rename("scenarios", "fnx_scenario")
    _rename("execution_runs", "fnx_execution_run")
    _rename("execution_logs", "fnx_execution_log")
    _rename("execution_step_results", "fnx_execution_step_result")

    _ensure_inst_cd("fnx_scenario")
    _ensure_inst_cd("fnx_execution_run")
    _ensure_inst_cd("fnx_execution_log")
    _ensure_inst_cd("fnx_execution_step_result")


def downgrade() -> None:
    raise NotImplementedError("0011_fnx_runtime_tables cannot be downgraded safely")

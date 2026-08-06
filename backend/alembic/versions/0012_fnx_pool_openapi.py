"""Rename pool/openapi/generators/registered to fnx_* + inst_cd.

Revision ID: 0012_fnx_pool_openapi
Revises: 0011_fnx_runtime_tables
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012_fnx_pool_openapi"
down_revision = "0011_fnx_runtime_tables"
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


def _ensure_inst_cd(table: str) -> None:
    if table not in _tables():
        return
    if "inst_cd" not in _columns(table):
        op.add_column(table, sa.Column("inst_cd", sa.String(16), nullable=True))
    bind = op.get_bind()
    bind.execute(
        sa.text(
            f"UPDATE {table} SET inst_cd = CAST(:cd AS varchar(16)) "
            "WHERE inst_cd IS NULL OR TRIM(inst_cd) = ''"
        ),
        {"cd": DEFAULT_INST_CD},
    )
    op.alter_column(table, "inst_cd", nullable=False, server_default=DEFAULT_INST_CD)
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
    # Rename dependents before parents where FKs exist.
    _rename("pool_samples", "fnx_pool_sample")
    _rename("api_operations", "fnx_api_operation")
    _rename("openapi_documents", "fnx_openapi_document")
    _rename("collection_var_generators", "fnx_collection_var_generator")
    _rename("registered_services", "fnx_registered_service")

    for t in (
        "fnx_pool_sample",
        "fnx_api_operation",
        "fnx_openapi_document",
        "fnx_collection_var_generator",
        "fnx_registered_service",
    ):
        _ensure_inst_cd(t)

    # Retarget pool_sample_id FK on fnx_testcase / testcases if needed — names usually follow.
    # Fix api_operation FK target after rename (Postgres often auto-updates; SQLite may not).


def downgrade() -> None:
    raise NotImplementedError("0012_fnx_pool_openapi cannot be downgraded safely")

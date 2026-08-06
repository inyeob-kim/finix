"""Rename catalog/manual/façade to fnx_*; add inst_cd on façade.

Revision ID: 0013_fnx_catalog_facade
Revises: 0012_fnx_pool_openapi
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0013_fnx_catalog_facade"
down_revision = "0012_fnx_pool_openapi"
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
    # Shared masters: rename only (no inst_cd).
    _rename("service_catalog_items", "fnx_service_catalog")
    _rename("manual_chunks", "fnx_manual_chunk")
    _rename("manual_index_meta", "fnx_manual_index_meta")

    # Façade: rename + tenant scope.
    _rename("service_rules_current", "fnx_rule_doc_current")
    _rename("service_rule_history", "fnx_rule_doc_hist")
    _ensure_inst_cd("fnx_rule_doc_current")
    _ensure_inst_cd("fnx_rule_doc_hist")

    # Drop global unique on service_code if present; replace with (inst_cd, service_code).
    if "fnx_rule_doc_current" in _tables():
        bind = op.get_bind()
        uqs = {
            u.get("name")
            for u in sa.inspect(bind).get_unique_constraints("fnx_rule_doc_current")
            if u.get("name")
        }
        # Common Alembic/SQLAlchemy names
        for cand in list(uqs):
            cols = next(
                (
                    u.get("column_names")
                    for u in sa.inspect(bind).get_unique_constraints("fnx_rule_doc_current")
                    if u.get("name") == cand
                ),
                [],
            )
            if cols == ["service_code"] or set(cols or []) == {"service_code"}:
                op.drop_constraint(cand, "fnx_rule_doc_current", type_="unique")
        # Also drop unique indexes named like uq / ix
        for ix in sa.inspect(bind).get_indexes("fnx_rule_doc_current"):
            if ix.get("unique") and ix.get("column_names") == ["service_code"]:
                name = ix.get("name")
                if name:
                    op.drop_index(name, table_name="fnx_rule_doc_current")
        existing = {
            u.get("name")
            for u in sa.inspect(bind).get_unique_constraints("fnx_rule_doc_current")
            if u.get("name")
        }
        if "uq_fnx_rule_doc_current_inst_svc" not in existing:
            op.create_unique_constraint(
                "uq_fnx_rule_doc_current_inst_svc",
                "fnx_rule_doc_current",
                ["inst_cd", "service_code"],
            )


def downgrade() -> None:
    raise NotImplementedError("0013_fnx_catalog_facade cannot be downgraded safely")

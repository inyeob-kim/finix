"""Drop legacy testcases table; execution refs are natural-key only.

Revision ID: 0015_drop_testcases
Revises: 0014_drop_legacy_shells
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0015_drop_testcases"
down_revision = "0014_drop_legacy_shells"
branch_labels = None
depends_on = None


def _tables():
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table):
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _drop_fk(table, *referred):
    if table not in _tables():
        return
    referred_set = set(referred)
    for fk in list(sa.inspect(op.get_bind()).get_foreign_keys(table)):
        if fk.get("referred_table") in referred_set and fk.get("name"):
            op.drop_constraint(fk["name"], table, type_="foreignkey")


def upgrade():
    bind = op.get_bind()

    # Execution step results: drop legacy testcase_id.
    if "fnx_execution_step_result" in _tables():
        _drop_fk("fnx_execution_step_result", "testcases")
        cols = _columns("fnx_execution_step_result")
        if "testcase_id" in cols:
            op.drop_column("fnx_execution_step_result", "testcase_id")

    # Execution logs: replace testcase_id with natural-key columns.
    if "fnx_execution_log" in _tables():
        _drop_fk("fnx_execution_log", "testcases")
        cols = _columns("fnx_execution_log")
        if "testcase_id" in cols:
            op.drop_column("fnx_execution_log", "testcase_id")
        if "svc_code" not in cols:
            op.add_column(
                "fnx_execution_log",
                sa.Column("svc_code", sa.String(64), nullable=True),
            )
        if "rule_case_id" not in cols:
            op.add_column(
                "fnx_execution_log",
                sa.Column("rule_case_id", sa.String(64), nullable=True),
            )

    # Allow pool-promoted TCs (POOL-*) without a matching fnx_rule_case row.
    if "fnx_testcase" in _tables():
        _drop_fk("fnx_testcase", "fnx_rule_case")

    if "testcases" in _tables():
        _drop_fk("testcases", "fnx_scenario", "fnx_pool_sample", "fnx_rule_doc_hist", "scenarios")
        op.execute(sa.text('DROP TABLE IF EXISTS "testcases" CASCADE'))


def downgrade():
    raise NotImplementedError("0015_drop_testcases cannot be downgraded")

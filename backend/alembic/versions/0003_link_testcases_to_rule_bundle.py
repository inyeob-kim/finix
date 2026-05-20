"""link testcases to rule bundle

Revision ID: 0003_link_testcases_to_rule_bundle
Revises: 0002_service_catalog_and_rules
Create Date: 2026-05-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0003_testcases_rule_bundle"
down_revision = "0002_service_catalog_and_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("testcases")}

    # SQLite cannot ALTER TABLE to add FKs; batch mode recreates the table.
    with op.batch_alter_table("testcases", schema=None) as batch_op:
        if "rule_bundle_id" not in columns:
            batch_op.add_column(
                sa.Column("rule_bundle_id", sa.Integer(), nullable=True)
            )
        batch_op.create_foreign_key(
            "fk_testcases_rule_bundle_id",
            "service_rule_bundles",
            ["rule_bundle_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("testcases", schema=None) as batch_op:
        batch_op.drop_constraint("fk_testcases_rule_bundle_id", type_="foreignkey")
        batch_op.drop_column("rule_bundle_id")

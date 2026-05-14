"""link testcases to rule bundle

Revision ID: 0003_link_testcases_to_rule_bundle
Revises: 0002_service_catalog_and_rules
Create Date: 2026-05-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0003_link_testcases_to_rule_bundle"
down_revision = "0002_service_catalog_and_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("testcases", sa.Column("rule_bundle_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_testcases_rule_bundle_id",
        "testcases",
        "service_rule_bundles",
        ["rule_bundle_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_testcases_rule_bundle_id", "testcases", type_="foreignkey")
    op.drop_column("testcases", "rule_bundle_id")


"""service catalog and rules tables

Revision ID: 0002_service_catalog_and_rules
Revises: 0001_init_schema
Create Date: 2026-05-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0002_service_catalog_and_rules"
down_revision = "0001_init_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "service_catalog_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("service_code", sa.String(length=64), nullable=False),
        sa.Column("service_name", sa.String(length=255), nullable=False, server_default=sa.text("''")),
        sa.Column("http_method", sa.String(length=16), nullable=False, server_default=sa.text("''")),
        sa.Column("uri", sa.String(length=512), nullable=False, server_default=sa.text("''")),
        sa.Column("tags_json", sa.Text(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.Column(
            "source",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("'cbs_srvc.json'"),
        ),
        sa.Column("source_version", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("service_code", name="uq_service_catalog_items_service_code"),
    )

    op.create_table(
        "service_rule_bundles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("service_code", sa.String(length=64), nullable=False),
        sa.Column("service_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("source_version", sa.String(length=128), nullable=True),
        sa.Column("yaml_text", sa.Text(), nullable=False),
        sa.Column("rules_json", sa.Text(), nullable=True),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_service_rule_bundles_service_code",
        "service_rule_bundles",
        ["service_code"],
    )
    op.create_index(
        "uq_service_rule_bundles_service_code_version",
        "service_rule_bundles",
        ["service_code", "version"],
        unique=True,
    )

    op.create_table(
        "service_rule_pointers",
        sa.Column("service_code", sa.String(length=64), primary_key=True),
        sa.Column(
            "active_bundle_id",
            sa.Integer(),
            sa.ForeignKey("service_rule_bundles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "approved_bundle_id",
            sa.Integer(),
            sa.ForeignKey("service_rule_bundles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("service_rule_pointers")
    op.drop_index("uq_service_rule_bundles_service_code_version", table_name="service_rule_bundles")
    op.drop_index("ix_service_rule_bundles_service_code", table_name="service_rule_bundles")
    op.drop_table("service_rule_bundles")
    op.drop_table("service_catalog_items")


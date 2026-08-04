"""link collection_var_generators

Revision ID: 0005_collection_var_generators
Revises: 0004_data_pool_openapi
Create Date: 2026-07-31
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_collection_var_generators"
down_revision = "0004_data_pool_openapi"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "collection_var_generators",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=512), server_default="", nullable=False),
        sa.Column("prompt", sa.Text(), server_default="", nullable=False),
        sa.Column("impl_kind", sa.String(length=32), nullable=False),
        sa.Column("impl_json", sa.Text(), server_default="{}", nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("created_by", sa.String(length=64), server_default="", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )
    op.create_index(
        "ix_collection_var_generators_key",
        "collection_var_generators",
        ["key"],
    )
    op.create_index(
        "ix_collection_var_generators_status",
        "collection_var_generators",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_collection_var_generators_status", table_name="collection_var_generators")
    op.drop_index("ix_collection_var_generators_key", table_name="collection_var_generators")
    op.drop_table("collection_var_generators")

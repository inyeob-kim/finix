"""link data pool and openapi tables

Revision ID: 0004_data_pool_openapi
Revises: 0003_testcases_rule_bundle
Create Date: 2026-07-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0004_data_pool_openapi"
down_revision = "0003_testcases_rule_bundle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "openapi_documents",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), server_default="", nullable=False),
        sa.Column("version", sa.String(length=64), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column(
            "imported_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("checksum"),
    )
    op.create_table(
        "api_operations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("openapi_document_id", sa.Integer(), nullable=True),
        sa.Column("service_code", sa.String(length=64), nullable=True),
        sa.Column("method", sa.String(length=16), nullable=False),
        sa.Column("path", sa.String(length=512), nullable=False),
        sa.Column("operation_id", sa.String(length=255), nullable=True),
        sa.Column("summary", sa.String(length=512), nullable=True),
        sa.Column("request_schema_json", sa.Text(), nullable=True),
        sa.Column("response_schema_json", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["openapi_document_id"],
            ["openapi_documents.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("method", "path", name="uq_api_operations_method_path"),
    )
    op.create_index("ix_api_operations_service_code", "api_operations", ["service_code"])

    op.create_table(
        "pool_samples",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("api_operation_id", sa.Integer(), nullable=True),
        sa.Column("service_code", sa.String(length=64), nullable=True),
        sa.Column("method", sa.String(length=16), server_default="POST", nullable=False),
        sa.Column("endpoint", sa.String(length=512), server_default="/", nullable=False),
        sa.Column("path_kind", sa.String(length=16), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("biz_error_code", sa.String(length=128), nullable=True),
        sa.Column("cbb_header_json", sa.Text(), nullable=True),
        sa.Column("request_body_json", sa.Text(), nullable=True),
        sa.Column("response_body_json", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=64), server_default="paste", nullable=False),
        sa.Column("source_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("quality_score", sa.Float(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["api_operation_id"],
            ["api_operations.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_fingerprint", name="uq_pool_samples_fingerprint"),
    )
    op.create_index("ix_pool_samples_service_code", "pool_samples", ["service_code"])
    op.create_index("ix_pool_samples_path_kind", "pool_samples", ["path_kind"])
    op.create_index("ix_pool_samples_biz_error_code", "pool_samples", ["biz_error_code"])

    with op.batch_alter_table("testcases", schema=None) as batch_op:
        batch_op.add_column(sa.Column("pool_sample_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_testcases_pool_sample_id",
            "pool_samples",
            ["pool_sample_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("testcases", schema=None) as batch_op:
        batch_op.drop_constraint("fk_testcases_pool_sample_id", type_="foreignkey")
        batch_op.drop_column("pool_sample_id")
    op.drop_table("pool_samples")
    op.drop_table("api_operations")
    op.drop_table("openapi_documents")

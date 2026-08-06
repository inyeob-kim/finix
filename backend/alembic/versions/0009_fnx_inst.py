"""Create fnx_inst institution master and seed default 1001.

Revision ID: 0009_fnx_inst
Revises: 0008_fnx_inst_natural_keys
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009_fnx_inst"
down_revision = "0008_fnx_inst_natural_keys"
branch_labels = None
depends_on = None

DEFAULT_INST_CD = "1001"
DEFAULT_INST_NM = "FINIX 기본"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if "fnx_inst" not in _tables():
        op.create_table(
            "fnx_inst",
            sa.Column("inst_cd", sa.String(length=16), nullable=False),
            sa.Column("inst_nm", sa.String(length=128), nullable=False),
            sa.Column(
                "is_active",
                sa.Boolean(),
                server_default=sa.text("true"),
                nullable=False,
            ),
            sa.Column("remark", sa.String(length=512), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.PrimaryKeyConstraint("inst_cd"),
        )
        op.create_index("ix_fnx_inst_is_active", "fnx_inst", ["is_active"])

    bind = op.get_bind()
    existing = bind.execute(
        sa.text("SELECT 1 FROM fnx_inst WHERE inst_cd = :cd"),
        {"cd": DEFAULT_INST_CD},
    ).first()
    if existing is None:
        bind.execute(
            sa.text(
                """
                INSERT INTO fnx_inst (inst_cd, inst_nm, is_active, remark)
                VALUES (:inst_cd, :inst_nm, true, :remark)
                """
            ),
            {
                "inst_cd": DEFAULT_INST_CD,
                "inst_nm": DEFAULT_INST_NM,
                "remark": "migration seed",
            },
        )


def downgrade() -> None:
    if "fnx_inst" in _tables():
        op.drop_table("fnx_inst")

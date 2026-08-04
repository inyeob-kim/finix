"""Migrate service rules from versioned bundles to current + history.

Revision ID: 0006_rules_current_history
Revises: 0005_collection_var_generators
Create Date: 2026-08-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_rules_current_history"
down_revision = "0005_collection_var_generators"
branch_labels = None
depends_on = None


def _create_current_if_missing(tables: set[str]) -> None:
    if "service_rules_current" in tables:
        return
    op.create_table(
        "service_rules_current",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("service_code", sa.String(length=64), nullable=False),
        sa.Column("service_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("source_version", sa.String(length=128), nullable=True),
        sa.Column("yaml_text", sa.Text(), server_default="", nullable=False),
        sa.Column("rules_json", sa.Text(), nullable=True),
        sa.Column("checksum", sa.String(length=64), server_default="", nullable=False),
        sa.Column("draft_yaml_text", sa.Text(), nullable=True),
        sa.Column("draft_rules_json", sa.Text(), nullable=True),
        sa.Column("draft_checksum", sa.String(length=64), nullable=True),
        sa.Column("draft_source_version", sa.String(length=128), nullable=True),
        sa.Column("draft_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("draft_updated_by", sa.String(length=128), nullable=True),
        sa.Column("updated_by", sa.String(length=128), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("service_code"),
    )
    op.create_index(
        "ix_service_rules_current_service_code",
        "service_rules_current",
        ["service_code"],
    )


def _create_history_if_missing(tables: set[str]) -> None:
    if "service_rule_history" in tables:
        return
    op.create_table(
        "service_rule_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("service_code", sa.String(length=64), nullable=False),
        sa.Column("service_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("source_version", sa.String(length=128), nullable=True),
        sa.Column("yaml_text", sa.Text(), nullable=False),
        sa.Column("rules_json", sa.Text(), nullable=True),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("change_kind", sa.String(length=32), server_default="apply", nullable=False),
        sa.Column("note", sa.String(length=512), nullable=True),
        sa.Column("created_by", sa.String(length=128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_service_rule_history_service_code",
        "service_rule_history",
        ["service_code"],
    )


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = set(inspector.get_table_names())

    # App create_all may have already created empty target tables.
    _create_current_if_missing(tables)
    _create_history_if_missing(tables)

    tables = set(sa.inspect(conn).get_table_names())

    if "service_rule_bundles" in tables:
        # Copy every bundle into history (skip if already migrated).
        conn.execute(
            sa.text(
                """
                INSERT INTO service_rule_history (
                    service_code, service_name_snapshot, source_version,
                    yaml_text, rules_json, checksum, change_kind, note,
                    created_by, created_at
                )
                SELECT
                    b.service_code, b.service_name_snapshot, b.source_version,
                    b.yaml_text, b.rules_json, b.checksum, 'migrate',
                    'migrated from bundle v' || CAST(b.version AS VARCHAR),
                    b.created_by, b.created_at
                FROM service_rule_bundles b
                WHERE NOT EXISTS (
                    SELECT 1 FROM service_rule_history h
                    WHERE h.service_code = b.service_code
                      AND h.checksum = b.checksum
                      AND h.change_kind = 'migrate'
                )
                ORDER BY b.service_code, b.version
                """
            )
        )

        # Active → current applied yaml (only missing services).
        if "service_rule_pointers" in tables:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO service_rules_current (
                        service_code, service_name_snapshot, source_version,
                        yaml_text, rules_json, checksum, updated_by, created_at, updated_at
                    )
                    SELECT
                        p.service_code,
                        b.service_name_snapshot,
                        b.source_version,
                        b.yaml_text,
                        b.rules_json,
                        b.checksum,
                        b.created_by,
                        b.created_at,
                        b.updated_at
                    FROM service_rule_pointers p
                    JOIN service_rule_bundles b ON b.id = p.active_bundle_id
                    WHERE p.active_bundle_id IS NOT NULL
                      AND NOT EXISTS (
                        SELECT 1 FROM service_rules_current c
                        WHERE c.service_code = p.service_code
                      )
                    """
                )
            )

        # Latest draft (not the active row) → draft_* on current.
        conn.execute(
            sa.text(
                """
                UPDATE service_rules_current
                SET
                    draft_yaml_text = d.yaml_text,
                    draft_rules_json = d.rules_json,
                    draft_checksum = d.checksum,
                    draft_source_version = d.source_version,
                    draft_updated_at = d.updated_at,
                    draft_updated_by = d.created_by
                FROM (
                    SELECT DISTINCT ON (b.service_code)
                        b.service_code,
                        b.yaml_text,
                        b.rules_json,
                        b.checksum,
                        b.source_version,
                        b.updated_at,
                        b.created_by,
                        b.id AS bundle_id
                    FROM service_rule_bundles b
                    WHERE LOWER(TRIM(b.status)) = 'draft'
                    ORDER BY b.service_code, b.version DESC
                ) d
                LEFT JOIN service_rule_pointers p ON p.service_code = d.service_code
                WHERE service_rules_current.service_code = d.service_code
                  AND (p.active_bundle_id IS NULL OR p.active_bundle_id <> d.bundle_id)
                  AND service_rules_current.draft_yaml_text IS NULL
                """
            )
        )

        # Draft-only services (never activated): create current row with empty applied + draft.
        conn.execute(
            sa.text(
                """
                INSERT INTO service_rules_current (
                    service_code, service_name_snapshot, source_version,
                    yaml_text, rules_json, checksum,
                    draft_yaml_text, draft_rules_json, draft_checksum,
                    draft_source_version, draft_updated_at, draft_updated_by,
                    updated_by, created_at, updated_at
                )
                SELECT DISTINCT ON (b.service_code)
                    b.service_code,
                    b.service_name_snapshot,
                    NULL,
                    '',
                    NULL,
                    '',
                    b.yaml_text,
                    b.rules_json,
                    b.checksum,
                    b.source_version,
                    b.updated_at,
                    b.created_by,
                    b.created_by,
                    b.created_at,
                    b.updated_at
                FROM service_rule_bundles b
                WHERE LOWER(TRIM(b.status)) = 'draft'
                  AND NOT EXISTS (
                    SELECT 1 FROM service_rules_current c
                    WHERE c.service_code = b.service_code
                  )
                ORDER BY b.service_code, b.version DESC
                """
            )
        )

    # Remap testcases.rule_bundle_id → rule_history_id
    inspector = sa.inspect(conn)
    tc_cols = {c["name"] for c in inspector.get_columns("testcases")}
    if "rule_bundle_id" in tc_cols:
        if "rule_history_id" not in tc_cols:
            with op.batch_alter_table("testcases") as batch_op:
                batch_op.add_column(
                    sa.Column("rule_history_id", sa.Integer(), nullable=True)
                )

        tables = set(inspector.get_table_names())
        if "service_rule_bundles" in tables:
            conn.execute(
                sa.text(
                    """
                    UPDATE testcases
                    SET rule_history_id = h.id
                    FROM service_rule_bundles b
                    JOIN service_rule_history h
                      ON h.service_code = b.service_code
                     AND h.checksum = b.checksum
                     AND h.change_kind = 'migrate'
                    WHERE testcases.rule_bundle_id = b.id
                      AND testcases.rule_history_id IS NULL
                    """
                )
            )

        # Refresh FK names after possible column add.
        inspector = sa.inspect(conn)
        fk_names = [
            fk["name"]
            for fk in inspector.get_foreign_keys("testcases")
            if "rule_bundle_id" in (fk.get("constrained_columns") or [])
        ]
        existing_fks = {
            fk["name"] for fk in inspector.get_foreign_keys("testcases") if fk.get("name")
        }
        with op.batch_alter_table("testcases") as batch_op:
            for name in fk_names:
                if name:
                    batch_op.drop_constraint(name, type_="foreignkey")
            batch_op.drop_column("rule_bundle_id")
            if "fk_testcases_rule_history_id" not in existing_fks:
                batch_op.create_foreign_key(
                    "fk_testcases_rule_history_id",
                    "service_rule_history",
                    ["rule_history_id"],
                    ["id"],
                    ondelete="SET NULL",
                )

    # Drop pointers then bundles
    tables = set(sa.inspect(conn).get_table_names())
    if "service_rule_pointers" in tables:
        op.drop_table("service_rule_pointers")
    if "service_rule_bundles" in tables:
        op.drop_table("service_rule_bundles")


def downgrade() -> None:
    raise NotImplementedError("Downgrade from current+history is not supported")

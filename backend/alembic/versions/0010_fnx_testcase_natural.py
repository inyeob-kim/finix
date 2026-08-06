"""Rename case_id→rule_case_id; add fnx_testcase(+hist); fnx_inst FKs; extra_json.

Revision ID: 0010_fnx_testcase_natural
Revises: 0009_fnx_inst
Create Date: 2026-08-06
"""

from __future__ import annotations

import hashlib
import json

import sqlalchemy as sa
from alembic import op

revision = "0010_fnx_testcase_natural"
down_revision = "0009_fnx_inst"
branch_labels = None
depends_on = None

DEFAULT_INST_CD = "1001"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _fk_names(table: str) -> set[str]:
    return {
        fk.get("name")
        for fk in sa.inspect(op.get_bind()).get_foreign_keys(table)
        if fk.get("name")
    }


def _rename_case_id_column(table: str) -> None:
    if table not in _tables():
        return
    cols = _columns(table)
    if "rule_case_id" in cols:
        return
    if "case_id" not in cols:
        return
    # Drop FKs that reference case_id (hist → case).
    for fk in list(sa.inspect(op.get_bind()).get_foreign_keys(table)):
        name = fk.get("name")
        if not name:
            continue
        cols_constrained = set(fk.get("constrained_columns") or [])
        if "case_id" in cols_constrained:
            op.drop_constraint(name, table, type_="foreignkey")
    op.alter_column(table, "case_id", new_column_name="rule_case_id")


def _recreate_hist_fk() -> None:
    if "fnx_rule_case_hist" not in _tables() or "fnx_rule_case" not in _tables():
        return
    # Drop any leftover FKs on hist then recreate composite FK.
    for fk in list(sa.inspect(op.get_bind()).get_foreign_keys("fnx_rule_case_hist")):
        name = fk.get("name")
        if name:
            op.drop_constraint(name, "fnx_rule_case_hist", type_="foreignkey")
    op.create_foreign_key(
        "fk_fnx_rule_case_hist_case",
        "fnx_rule_case_hist",
        "fnx_rule_case",
        ["inst_cd", "svc_code", "rule_case_id"],
        ["inst_cd", "svc_code", "rule_case_id"],
        ondelete="CASCADE",
    )


def _add_extra_json() -> None:
    if "fnx_rule_case" not in _tables():
        return
    cols = _columns("fnx_rule_case")
    with op.batch_alter_table("fnx_rule_case") as batch_op:
        if "extra_json" not in cols:
            batch_op.add_column(sa.Column("extra_json", sa.Text(), nullable=True))
        if "draft_extra_json" not in cols:
            batch_op.add_column(sa.Column("draft_extra_json", sa.Text(), nullable=True))


def _add_fnx_inst_fk_on_svc() -> None:
    if "fnx_rule_svc" not in _tables() or "fnx_inst" not in _tables():
        return
    fks = _fk_names("fnx_rule_svc")
    if "fk_fnx_rule_svc_inst" in fks:
        return
    # Ensure default inst exists for any orphan rows.
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            INSERT INTO fnx_inst (inst_cd, inst_nm, is_active, remark)
            SELECT CAST(:cd AS varchar(16)), CAST(:nm AS varchar(128)), true,
                   CAST(:rm AS varchar(512))
            WHERE NOT EXISTS (SELECT 1 FROM fnx_inst WHERE inst_cd = CAST(:cd AS varchar(16)))
            """
        ),
        {"cd": DEFAULT_INST_CD, "nm": "FINIX default", "rm": "migration seed"},
    )
    bind.execute(
        sa.text(
            "UPDATE fnx_rule_svc SET inst_cd = :cd "
            "WHERE inst_cd IS NULL OR inst_cd = '' "
            "OR inst_cd NOT IN (SELECT inst_cd FROM fnx_inst)"
        ),
        {"cd": DEFAULT_INST_CD},
    )
    op.create_foreign_key(
        "fk_fnx_rule_svc_inst",
        "fnx_rule_svc",
        "fnx_inst",
        ["inst_cd"],
        ["inst_cd"],
        ondelete="RESTRICT",
    )


def _create_fnx_testcase() -> None:
    if "fnx_testcase" in _tables():
        return
    op.create_table(
        "fnx_testcase",
        sa.Column("inst_cd", sa.String(16), nullable=False, server_default=DEFAULT_INST_CD),
        sa.Column("svc_code", sa.String(64), nullable=False),
        sa.Column("rule_case_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("http_method", sa.String(16), nullable=True),
        sa.Column("endpoint", sa.String(512), nullable=True),
        sa.Column("request_body_json", sa.Text(), nullable=True),
        sa.Column("expected_status", sa.Integer(), nullable=True),
        sa.Column("expected_body_json", sa.Text(), nullable=True),
        sa.Column("assertions_json", sa.Text(), nullable=True),
        sa.Column("rule_case_hist_version", sa.Integer(), nullable=True),
        sa.Column("checksum", sa.String(64), nullable=False, server_default=""),
        sa.Column("pool_sample_id", sa.Integer(), nullable=True),
        sa.Column("updated_by", sa.String(128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("inst_cd", "svc_code", "rule_case_id"),
        sa.ForeignKeyConstraint(
            ["inst_cd", "svc_code", "rule_case_id"],
            [
                "fnx_rule_case.inst_cd",
                "fnx_rule_case.svc_code",
                "fnx_rule_case.rule_case_id",
            ],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["pool_sample_id"],
            ["pool_samples.id"],
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_fnx_testcase_inst_cd", "fnx_testcase", ["inst_cd"])
    op.create_index("ix_fnx_testcase_svc_code", "fnx_testcase", ["svc_code"])
    op.create_index("ix_fnx_testcase_rule_case_id", "fnx_testcase", ["rule_case_id"])

    if "fnx_testcase_hist" in _tables():
        return
    op.create_table(
        "fnx_testcase_hist",
        sa.Column("inst_cd", sa.String(16), nullable=False, server_default=DEFAULT_INST_CD),
        sa.Column("svc_code", sa.String(64), nullable=False),
        sa.Column("rule_case_id", sa.String(64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("change_kind", sa.String(32), nullable=False, server_default="materialize"),
        sa.Column("snapshot_json", sa.Text(), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("rule_case_hist_version", sa.Integer(), nullable=True),
        sa.Column("note", sa.String(512), nullable=True),
        sa.Column("created_by", sa.String(128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("inst_cd", "svc_code", "rule_case_id", "version"),
        sa.ForeignKeyConstraint(
            ["inst_cd", "svc_code", "rule_case_id"],
            [
                "fnx_testcase.inst_cd",
                "fnx_testcase.svc_code",
                "fnx_testcase.rule_case_id",
            ],
            ondelete="CASCADE",
        ),
    )


def _checksum(payload: dict) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _migrate_pool_testcases() -> None:
    if "testcases" not in _tables() or "fnx_testcase" not in _tables():
        return
    if "fnx_rule_case" not in _tables():
        return
    bind = op.get_bind()
    cols = _columns("testcases")
    # Only migrate pool rows that have a rule_case_id string and matching fnx_rule_case.
    if "rule_case_id" not in cols:
        return
    rows = bind.execute(
        sa.text(
            """
            SELECT *
            FROM testcases
            WHERE scenario_id IS NULL
              AND rule_case_id IS NOT NULL
              AND TRIM(rule_case_id) <> ''
            ORDER BY id ASC
            """
        )
    ).mappings().all()
    for row in rows:
        inst = (row.get("inst_cd") or "").strip() or DEFAULT_INST_CD
        svc = (row.get("rule_svc_code") or "").strip()
        cid = str(row.get("rule_case_id") or "").strip()
        if not svc or not cid:
            continue
        exists_case = bind.execute(
            sa.text(
                """
                SELECT 1 FROM fnx_rule_case
                WHERE inst_cd = :inst AND svc_code = :svc AND rule_case_id = :cid
                """
            ),
            {"inst": inst, "svc": svc, "cid": cid},
        ).first()
        if not exists_case:
            continue
        snap = {
            "name": row.get("name"),
            "http_method": row.get("http_method"),
            "endpoint": row.get("endpoint"),
            "request_body_json": row.get("request_body_json"),
            "expected_status": row.get("expected_status"),
            "expected_body_json": row.get("expected_body_json"),
        }
        cs = _checksum(snap)
        bind.execute(
            sa.text(
                """
                INSERT INTO fnx_testcase (
                    inst_cd, svc_code, rule_case_id, name,
                    http_method, endpoint, request_body_json,
                    expected_status, expected_body_json,
                    rule_case_hist_version, checksum, pool_sample_id
                ) VALUES (
                    :inst, :svc, :cid, :name,
                    :method, :endpoint, :body,
                    :estatus, :ebody,
                    :hist_ver, :checksum, :pool
                )
                ON CONFLICT (inst_cd, svc_code, rule_case_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    http_method = EXCLUDED.http_method,
                    endpoint = EXCLUDED.endpoint,
                    request_body_json = EXCLUDED.request_body_json,
                    expected_status = EXCLUDED.expected_status,
                    expected_body_json = EXCLUDED.expected_body_json,
                    rule_case_hist_version = EXCLUDED.rule_case_hist_version,
                    checksum = EXCLUDED.checksum,
                    pool_sample_id = EXCLUDED.pool_sample_id
                """
            ),
            {
                "inst": inst,
                "svc": svc,
                "cid": cid,
                "name": row.get("name") or cid,
                "method": row.get("http_method"),
                "endpoint": row.get("endpoint"),
                "body": row.get("request_body_json"),
                "estatus": row.get("expected_status"),
                "ebody": row.get("expected_body_json"),
                "hist_ver": row.get("rule_case_hist_version"),
                "checksum": cs,
                "pool": row.get("pool_sample_id"),
            },
        )
        bind.execute(
            sa.text(
                """
                INSERT INTO fnx_testcase_hist (
                    inst_cd, svc_code, rule_case_id, version,
                    change_kind, snapshot_json, checksum, rule_case_hist_version, note
                ) VALUES (
                    :inst, :svc, :cid, 1,
                    'migrate', :snap, :checksum, :hist_ver, 'migrated from testcases'
                )
                ON CONFLICT DO NOTHING
                """
            ),
            {
                "inst": inst,
                "svc": svc,
                "cid": cid,
                "snap": json.dumps(snap, ensure_ascii=False),
                "checksum": cs,
                "hist_ver": row.get("rule_case_hist_version"),
            },
        )


def _patch_execution_step_natural_keys() -> None:
    if "execution_step_results" not in _tables():
        return
    cols = _columns("execution_step_results")
    with op.batch_alter_table("execution_step_results") as batch_op:
        if "inst_cd" not in cols:
            batch_op.add_column(sa.Column("inst_cd", sa.String(16), nullable=True))
        if "svc_code" not in cols:
            batch_op.add_column(sa.Column("svc_code", sa.String(64), nullable=True))
        if "rule_case_id" not in cols:
            batch_op.add_column(sa.Column("rule_case_id", sa.String(64), nullable=True))
        if "tc_hist_version" not in cols:
            batch_op.add_column(sa.Column("tc_hist_version", sa.Integer(), nullable=True))


def _drop_legacy_testcases() -> None:
    """Legacy `testcases` kept until execution/API fully migrate to natural keys."""
    return


def upgrade() -> None:
    # Hist FK references case_id — drop before rename on parent.
    if "fnx_rule_case_hist" in _tables():
        for fk in list(sa.inspect(op.get_bind()).get_foreign_keys("fnx_rule_case_hist")):
            name = fk.get("name")
            if name:
                op.drop_constraint(name, "fnx_rule_case_hist", type_="foreignkey")
    _rename_case_id_column("fnx_rule_case")
    _rename_case_id_column("fnx_rule_case_hist")
    _recreate_hist_fk()
    _add_extra_json()
    _add_fnx_inst_fk_on_svc()
    _create_fnx_testcase()
    _migrate_pool_testcases()
    _patch_execution_step_natural_keys()
    _drop_legacy_testcases()


def downgrade() -> None:
    # Non-destructive reverse is not supported for this migration.
    raise NotImplementedError("0010_fnx_testcase_natural cannot be downgraded safely")

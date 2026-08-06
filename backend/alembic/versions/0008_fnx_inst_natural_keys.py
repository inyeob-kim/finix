"""Rebuild fnx_* with inst_cd natural PKs; retarget testcase rule links.

Revision ID: 0008_fnx_inst_natural_keys
Revises: 0007_fnx_rule_case
Create Date: 2026-08-06
"""

from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op

revision = "0008_fnx_inst_natural_keys"
down_revision = "0007_fnx_rule_case"
branch_labels = None
depends_on = None

DEFAULT_INST_CD = "1001"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _column_names(table: str) -> set[str]:
    bind = op.get_bind()
    if table not in sa.inspect(bind).get_table_names():
        return set()
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def _detach_testcase_rule_fks() -> None:
    """Drop testcases FKs onto fnx_* before rebuilding those tables (Postgres)."""
    if "testcases" not in _tables():
        return
    bind = op.get_bind()
    fks = {
        fk.get("name")
        for fk in sa.inspect(bind).get_foreign_keys("testcases")
        if fk.get("name")
    }
    names = [
        n
        for n in ("fk_testcases_rule_case_hist_id", "fk_testcases_rule_case_id")
        if n in fks
    ]
    if not names:
        return
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("testcases") as batch_op:
            for name in names:
                batch_op.drop_constraint(name, type_="foreignkey")
        return
    for name in names:
        op.drop_constraint(name, "testcases", type_="foreignkey")


def _drop_fnx_stack() -> None:
    # Drop dependents first (FKs from testcases must already be detached).
    for name in ("fnx_rule_case_hist", "fnx_rule_case", "fnx_rule_svc"):
        if name in _tables():
            op.drop_table(name)


def _create_fnx_stack() -> None:
    op.create_table(
        "fnx_rule_svc",
        sa.Column(
            "inst_cd",
            sa.String(length=16),
            server_default=DEFAULT_INST_CD,
            nullable=False,
        ),
        sa.Column("svc_code", sa.String(length=64), nullable=False),
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
        sa.PrimaryKeyConstraint("inst_cd", "svc_code"),
    )
    op.create_index("ix_fnx_rule_svc_inst_cd", "fnx_rule_svc", ["inst_cd"])
    op.create_index("ix_fnx_rule_svc_svc_code", "fnx_rule_svc", ["svc_code"])

    op.create_table(
        "fnx_rule_case",
        sa.Column(
            "inst_cd",
            sa.String(length=16),
            server_default=DEFAULT_INST_CD,
            nullable=False,
        ),
        sa.Column("svc_code", sa.String(length=64), nullable=False),
        sa.Column("case_id", sa.String(length=64), nullable=False),
        sa.Column("rule_type", sa.String(length=1), server_default="N", nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("input_json", sa.Text(), nullable=True),
        sa.Column("expect_json", sa.Text(), nullable=True),
        sa.Column("assertions_json", sa.Text(), nullable=True),
        sa.Column("tags_json", sa.Text(), nullable=True),
        sa.Column("evidence_json", sa.Text(), nullable=True),
        sa.Column("folder", sa.String(length=16), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("checksum", sa.String(length=64), server_default="", nullable=False),
        sa.Column("draft_input_json", sa.Text(), nullable=True),
        sa.Column("draft_expect_json", sa.Text(), nullable=True),
        sa.Column("draft_assertions_json", sa.Text(), nullable=True),
        sa.Column("draft_tags_json", sa.Text(), nullable=True),
        sa.Column("draft_evidence_json", sa.Text(), nullable=True),
        sa.Column("draft_title", sa.Text(), nullable=True),
        sa.Column("draft_description", sa.Text(), nullable=True),
        sa.Column("draft_rule_type", sa.String(length=1), nullable=True),
        sa.Column("draft_folder", sa.String(length=16), nullable=True),
        sa.Column("draft_checksum", sa.String(length=64), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["inst_cd", "svc_code"],
            ["fnx_rule_svc.inst_cd", "fnx_rule_svc.svc_code"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("inst_cd", "svc_code", "case_id"),
    )
    op.create_index("ix_fnx_rule_case_inst_cd", "fnx_rule_case", ["inst_cd"])
    op.create_index("ix_fnx_rule_case_svc_code", "fnx_rule_case", ["svc_code"])
    op.create_index("ix_fnx_rule_case_case_id", "fnx_rule_case", ["case_id"])

    op.create_table(
        "fnx_rule_case_hist",
        sa.Column(
            "inst_cd",
            sa.String(length=16),
            server_default=DEFAULT_INST_CD,
            nullable=False,
        ),
        sa.Column("svc_code", sa.String(length=64), nullable=False),
        sa.Column("case_id", sa.String(length=64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "change_kind", sa.String(length=32), server_default="apply", nullable=False
        ),
        sa.Column("snapshot_json", sa.Text(), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("note", sa.String(length=512), nullable=True),
        sa.Column("created_by", sa.String(length=128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["inst_cd", "svc_code", "case_id"],
            [
                "fnx_rule_case.inst_cd",
                "fnx_rule_case.svc_code",
                "fnx_rule_case.case_id",
            ],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("inst_cd", "svc_code", "case_id", "version"),
    )
    op.create_index("ix_fnx_rule_case_hist_inst_cd", "fnx_rule_case_hist", ["inst_cd"])
    op.create_index(
        "ix_fnx_rule_case_hist_svc_code", "fnx_rule_case_hist", ["svc_code"]
    )
    op.create_index(
        "ix_fnx_rule_case_hist_case_id", "fnx_rule_case_hist", ["case_id"]
    )


def _patch_testcases() -> None:
    if "testcases" not in _tables():
        return
    cols = _column_names("testcases")
    with op.batch_alter_table("testcases") as batch_op:
        if "inst_cd" not in cols:
            batch_op.add_column(sa.Column("inst_cd", sa.String(length=16), nullable=True))
        if "rule_svc_code" not in cols:
            batch_op.add_column(
                sa.Column("rule_svc_code", sa.String(length=64), nullable=True)
            )
        if "rule_case_hist_version" not in cols:
            batch_op.add_column(
                sa.Column("rule_case_hist_version", sa.Integer(), nullable=True)
            )
        # Integer FKs from 0007 are detached in _detach_testcase_rule_fks.
        # Recreate rule_case_id as string if old integer column exists: drop + add.
        if "rule_case_id" in cols:
            batch_op.drop_column("rule_case_id")
        if "rule_case_hist_id" in cols:
            batch_op.drop_column("rule_case_hist_id")
        batch_op.add_column(
            sa.Column("rule_case_id", sa.String(length=64), nullable=True)
        )


def _loads_rules(rules_json: str | None) -> list[dict]:
    if not rules_json:
        return []
    try:
        parsed = json.loads(rules_json)
    except Exception:  # noqa: BLE001
        return []
    if isinstance(parsed, dict):
        rules = parsed.get("rules")
    elif isinstance(parsed, list):
        rules = parsed
    else:
        return []
    if not isinstance(rules, list):
        return []
    return [r for r in rules if isinstance(r, dict)]


def _case_checksum(rule: dict) -> str:
    import hashlib

    payload = {
        "case_id": str(rule.get("case_id") or "").strip(),
        "rule_type": str(rule.get("rule_type") or "").strip().upper(),
        "title": rule.get("title"),
        "description": rule.get("description"),
        "input": rule.get("input"),
        "expect": rule.get("expect"),
        "assertions": rule.get("assertions"),
        "tags": rule.get("tags"),
        "source_evidence": rule.get("source_evidence"),
        "folder": rule.get("folder"),
        "extract": rule.get("extract"),
        "use": rule.get("use"),
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _backfill_from_current() -> None:
    bind = op.get_bind()
    if "service_rules_current" not in _tables():
        return
    rows = bind.execute(sa.text("SELECT * FROM service_rules_current")).mappings().all()
    for row in rows:
        svc_code = (row.get("service_code") or "").strip()
        if not svc_code:
            continue
        bind.execute(
            sa.text(
                """
                INSERT INTO fnx_rule_svc (
                    inst_cd, svc_code, service_name_snapshot, source_version,
                    yaml_text, rules_json, checksum,
                    draft_yaml_text, draft_rules_json, draft_checksum,
                    draft_source_version, draft_updated_at, draft_updated_by,
                    updated_by
                ) VALUES (
                    :inst_cd, :svc_code, :service_name_snapshot, :source_version,
                    :yaml_text, :rules_json, :checksum,
                    :draft_yaml_text, :draft_rules_json, :draft_checksum,
                    :draft_source_version, :draft_updated_at, :draft_updated_by,
                    :updated_by
                )
                """
            ),
            {
                "inst_cd": DEFAULT_INST_CD,
                "svc_code": svc_code,
                "service_name_snapshot": row.get("service_name_snapshot"),
                "source_version": row.get("source_version"),
                "yaml_text": row.get("yaml_text") or "",
                "rules_json": row.get("rules_json"),
                "checksum": row.get("checksum") or "",
                "draft_yaml_text": row.get("draft_yaml_text"),
                "draft_rules_json": row.get("draft_rules_json"),
                "draft_checksum": row.get("draft_checksum"),
                "draft_source_version": row.get("draft_source_version"),
                "draft_updated_at": row.get("draft_updated_at"),
                "draft_updated_by": row.get("draft_updated_by"),
                "updated_by": row.get("updated_by"),
            },
        )
        applied_rules = _loads_rules(row.get("rules_json"))
        draft_rules = _loads_rules(row.get("draft_rules_json"))
        draft_by_id = {
            str(r.get("case_id") or "").strip(): r
            for r in draft_rules
            if str(r.get("case_id") or "").strip()
        }
        applied_ids = {
            str(r.get("case_id") or "").strip()
            for r in applied_rules
            if str(r.get("case_id") or "").strip()
        }
        ordered: list[dict] = []
        for r in applied_rules:
            if str(r.get("case_id") or "").strip():
                ordered.append(r)
        for r in draft_rules:
            cid = str(r.get("case_id") or "").strip()
            if cid and cid not in applied_ids:
                ordered.append(r)

        for idx, rule in enumerate(ordered):
            case_id = str(rule.get("case_id") or "").strip()
            if not case_id:
                continue
            is_applied = case_id in applied_ids
            applied = rule if is_applied else {}
            draft = draft_by_id.get(case_id)
            checksum = _case_checksum(applied) if is_applied and applied else ""
            params = {
                "inst_cd": DEFAULT_INST_CD,
                "svc_code": svc_code,
                "case_id": case_id,
                "rule_type": str((applied or rule).get("rule_type") or "N")
                .strip()
                .upper()
                or "N",
                "title": (applied or {}).get("title"),
                "description": (applied or {}).get("description"),
                "input_json": json.dumps((applied or {}).get("input") or {}, ensure_ascii=False)
                if is_applied
                else None,
                "expect_json": json.dumps(
                    (applied or {}).get("expect") or {}, ensure_ascii=False
                )
                if is_applied
                else None,
                "assertions_json": json.dumps(
                    (applied or {}).get("assertions") or [], ensure_ascii=False
                )
                if is_applied
                else None,
                "tags_json": json.dumps(
                    (applied or {}).get("tags") or [], ensure_ascii=False
                )
                if is_applied
                else None,
                "evidence_json": json.dumps(
                    (applied or {}).get("source_evidence") or {}, ensure_ascii=False
                )
                if is_applied
                else None,
                "folder": (applied or {}).get("folder"),
                "sort_order": idx,
                "checksum": checksum,
                "draft_input_json": None,
                "draft_expect_json": None,
                "draft_assertions_json": None,
                "draft_tags_json": None,
                "draft_evidence_json": None,
                "draft_title": None,
                "draft_description": None,
                "draft_rule_type": None,
                "draft_folder": None,
                "draft_checksum": None,
                "draft_updated_by": row.get("draft_updated_by"),
                "updated_by": row.get("updated_by"),
            }
            if draft is not None:
                params.update(
                    {
                        "draft_title": draft.get("title"),
                        "draft_description": draft.get("description"),
                        "draft_rule_type": str(draft.get("rule_type") or "N")
                        .strip()
                        .upper()
                        or "N",
                        "draft_input_json": json.dumps(
                            draft.get("input") or {}, ensure_ascii=False
                        ),
                        "draft_expect_json": json.dumps(
                            draft.get("expect") or {}, ensure_ascii=False
                        ),
                        "draft_assertions_json": json.dumps(
                            draft.get("assertions") or [], ensure_ascii=False
                        ),
                        "draft_tags_json": json.dumps(
                            draft.get("tags") or [], ensure_ascii=False
                        ),
                        "draft_evidence_json": json.dumps(
                            draft.get("source_evidence") or {}, ensure_ascii=False
                        ),
                        "draft_folder": draft.get("folder"),
                        "draft_checksum": _case_checksum(draft),
                    }
                )
            bind.execute(
                sa.text(
                    """
                    INSERT INTO fnx_rule_case (
                        inst_cd, svc_code, case_id, rule_type, title, description,
                        input_json, expect_json, assertions_json, tags_json,
                        evidence_json, folder, sort_order, checksum,
                        draft_input_json, draft_expect_json, draft_assertions_json,
                        draft_tags_json, draft_evidence_json, draft_title,
                        draft_description, draft_rule_type, draft_folder,
                        draft_checksum, draft_updated_by, updated_by
                    ) VALUES (
                        :inst_cd, :svc_code, :case_id, :rule_type, :title, :description,
                        :input_json, :expect_json, :assertions_json, :tags_json,
                        :evidence_json, :folder, :sort_order, :checksum,
                        :draft_input_json, :draft_expect_json, :draft_assertions_json,
                        :draft_tags_json, :draft_evidence_json, :draft_title,
                        :draft_description, :draft_rule_type, :draft_folder,
                        :draft_checksum, :draft_updated_by, :updated_by
                    )
                    """
                ),
                params,
            )
            if checksum:
                bind.execute(
                    sa.text(
                        """
                        INSERT INTO fnx_rule_case_hist (
                            inst_cd, svc_code, case_id, version, change_kind,
                            snapshot_json, checksum, note, created_by
                        ) VALUES (
                            :inst_cd, :svc_code, :case_id, 1, 'create',
                            :snapshot_json, :checksum,
                            'backfill after inst_cd natural keys', :created_by
                        )
                        """
                    ),
                    {
                        "inst_cd": DEFAULT_INST_CD,
                        "svc_code": svc_code,
                        "case_id": case_id,
                        "snapshot_json": json.dumps(
                            applied, ensure_ascii=False, default=str
                        ),
                        "checksum": checksum,
                        "created_by": row.get("updated_by"),
                    },
                )


def upgrade() -> None:
    _detach_testcase_rule_fks()
    _drop_fnx_stack()
    _create_fnx_stack()
    _patch_testcases()
    _backfill_from_current()


def downgrade() -> None:
    # Irreversible structural change; leave tables in place.
    pass

"""Copy leftover legacy tables into fnx_* then drop shells.

When create_all raced ahead of rename migrations, both old and new names
existed and rename was skipped - data stayed on the old side.

Revision ID: 0014_drop_legacy_shells
Revises: 0013_fnx_catalog_facade
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0014_drop_legacy_shells"
down_revision = "0013_fnx_catalog_facade"
branch_labels = None
depends_on = None

DEFAULT_INST_CD = "1001"

_PAIRS = (
    ("scenarios", "fnx_scenario"),
    ("execution_runs", "fnx_execution_run"),
    ("execution_logs", "fnx_execution_log"),
    ("execution_step_results", "fnx_execution_step_result"),
    ("pool_samples", "fnx_pool_sample"),
    ("api_operations", "fnx_api_operation"),
    ("openapi_documents", "fnx_openapi_document"),
    ("collection_var_generators", "fnx_collection_var_generator"),
    ("registered_services", "fnx_registered_service"),
    ("service_rules_current", "fnx_rule_doc_current"),
    ("service_rule_history", "fnx_rule_doc_hist"),
    ("service_catalog_items", "fnx_service_catalog"),
    ("manual_chunks", "fnx_manual_chunk"),
    ("manual_index_meta", "fnx_manual_index_meta"),
)


def _tables():
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table):
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _count(table):
    bind = op.get_bind()
    return int(bind.execute(sa.text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0)


def _copy_overlapping(legacy, target):
    if legacy not in _tables() or target not in _tables():
        return
    if _count(legacy) == 0:
        return
    leg_cols = _columns(legacy)
    tgt_cols = _columns(target)
    shared = sorted(leg_cols & tgt_cols)
    if not shared:
        return
    bind = op.get_bind()
    has_inst = "inst_cd" in tgt_cols
    if has_inst and "inst_cd" not in shared:
        select_list = ", ".join(shared)
        insert_cols = list(shared) + ["inst_cd"]
        col_sql = ", ".join(insert_cols)
        if "id" in shared:
            bind.execute(
                sa.text(
                    f"""
                    INSERT INTO {target} ({col_sql})
                    SELECT {select_list}, CAST(:inst AS varchar(16))
                    FROM {legacy} l
                    WHERE NOT EXISTS (
                        SELECT 1 FROM {target} t WHERE t.id = l.id
                    )
                    ON CONFLICT DO NOTHING
                    """
                ),
                {"inst": DEFAULT_INST_CD},
            )
        elif _count(target) == 0:
            bind.execute(
                sa.text(
                    f"""
                    INSERT INTO {target} ({col_sql})
                    SELECT {select_list}, CAST(:inst AS varchar(16))
                    FROM {legacy}
                    ON CONFLICT DO NOTHING
                    """
                ),
                {"inst": DEFAULT_INST_CD},
            )
        return

    col_sql = ", ".join(shared)
    select_exprs = []
    for col in shared:
        if col == "inst_cd":
            select_exprs.append(
                f"COALESCE(NULLIF(TRIM(l.inst_cd), ''), CAST(:inst AS varchar(16)))"
            )
        else:
            select_exprs.append(f"l.{col}")
    select_sql = ", ".join(select_exprs)
    params = {"inst": DEFAULT_INST_CD} if "inst_cd" in shared else {}
    if "id" in shared:
        bind.execute(
            sa.text(
                f"""
                INSERT INTO {target} ({col_sql})
                SELECT {select_sql} FROM {legacy} l
                WHERE NOT EXISTS (
                    SELECT 1 FROM {target} t WHERE t.id = l.id
                )
                ON CONFLICT DO NOTHING
                """
            ),
            params,
        )
    elif _count(target) == 0:
        bind.execute(
            sa.text(
                f"""
                INSERT INTO {target} ({col_sql})
                SELECT {select_sql} FROM {legacy} l
                ON CONFLICT DO NOTHING
                """
            ),
            params,
        )


def _drop_fk_to(table, referred):
    if table not in _tables():
        return
    for fk in list(sa.inspect(op.get_bind()).get_foreign_keys(table)):
        if fk.get("referred_table") == referred and fk.get("name"):
            op.drop_constraint(fk["name"], table, type_="foreignkey")


def upgrade():
    for legacy, target in _PAIRS:
        _copy_overlapping(legacy, target)

    if "testcases" in _tables():
        for ref in (
            "scenarios",
            "pool_samples",
            "service_rule_history",
            "fnx_scenario",
            "fnx_pool_sample",
            "fnx_rule_doc_hist",
        ):
            _drop_fk_to("testcases", ref)
        cols = _columns("testcases")
        if "scenario_id" in cols and "fnx_scenario" in _tables():
            op.create_foreign_key(
                "fk_testcases_fnx_scenario",
                "testcases",
                "fnx_scenario",
                ["scenario_id"],
                ["id"],
                ondelete="SET NULL",
            )
        if "pool_sample_id" in cols and "fnx_pool_sample" in _tables():
            op.create_foreign_key(
                "fk_testcases_fnx_pool_sample",
                "testcases",
                "fnx_pool_sample",
                ["pool_sample_id"],
                ["id"],
                ondelete="SET NULL",
            )
        if "rule_history_id" in cols and "fnx_rule_doc_hist" in _tables():
            op.create_foreign_key(
                "fk_testcases_fnx_rule_doc_hist",
                "testcases",
                "fnx_rule_doc_hist",
                ["rule_history_id"],
                ["id"],
                ondelete="SET NULL",
            )

    for table in (
        "fnx_execution_log",
        "fnx_execution_step_result",
        "execution_logs",
        "execution_step_results",
    ):
        _drop_fk_to(table, "testcases")
        _drop_fk_to(table, "execution_runs")
        _drop_fk_to(table, "fnx_execution_run")

    if "fnx_execution_step_result" in _tables() and "fnx_execution_run" in _tables():
        fks = {
            fk.get("name")
            for fk in sa.inspect(op.get_bind()).get_foreign_keys(
                "fnx_execution_step_result"
            )
            if fk.get("name")
        }
        if "fk_fnx_esr_run" not in fks:
            op.create_foreign_key(
                "fk_fnx_esr_run",
                "fnx_execution_step_result",
                "fnx_execution_run",
                ["execution_run_id"],
                ["id"],
                ondelete="CASCADE",
            )
        if (
            "testcase_id" in _columns("fnx_execution_step_result")
            and "testcases" in _tables()
            and "fk_fnx_esr_testcase" not in fks
        ):
            op.create_foreign_key(
                "fk_fnx_esr_testcase",
                "fnx_execution_step_result",
                "testcases",
                ["testcase_id"],
                ["id"],
                ondelete="SET NULL",
            )

    if "fnx_execution_log" in _tables() and "testcases" in _tables():
        fks = {
            fk.get("name")
            for fk in sa.inspect(op.get_bind()).get_foreign_keys("fnx_execution_log")
            if fk.get("name")
        }
        if "fk_fnx_elog_testcase" not in fks and "testcase_id" in _columns(
            "fnx_execution_log"
        ):
            op.create_foreign_key(
                "fk_fnx_elog_testcase",
                "fnx_execution_log",
                "testcases",
                ["testcase_id"],
                ["id"],
                ondelete="CASCADE",
            )

    if "fnx_execution_run" in _tables() and "fnx_scenario" in _tables():
        fks = {
            fk.get("name")
            for fk in sa.inspect(op.get_bind()).get_foreign_keys("fnx_execution_run")
            if fk.get("name")
        }
        if "fk_fnx_erun_scenario" not in fks and "scenario_id" in _columns(
            "fnx_execution_run"
        ):
            op.create_foreign_key(
                "fk_fnx_erun_scenario",
                "fnx_execution_run",
                "fnx_scenario",
                ["scenario_id"],
                ["id"],
                ondelete="SET NULL",
            )

    # Children may still FK parents among legacy shells; CASCADE is safe after copy.
    for legacy, _target in reversed(_PAIRS):
        if legacy in _tables():
            op.execute(sa.text(f'DROP TABLE IF EXISTS "{legacy}" CASCADE'))


def downgrade():
    raise NotImplementedError("0014_drop_legacy_shells cannot be downgraded")

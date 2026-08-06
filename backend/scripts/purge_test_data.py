"""
Remove runtime / test rows from the app database (PostgreSQL or SQLite via .env).

Always keeps:
  - service_catalog_items (CBS service catalog)
  - fnx_inst (institution master)

Usage (from backend/):
  python scripts/purge_test_data.py
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# Child tables first (FK / CASCADE safety). Catalog + fnx_inst are never listed.
_PURGE_TABLES: tuple[str, ...] = (
    "fnx_execution_step_result",
    "fnx_execution_run",
    "fnx_execution_log",
    "execution_step_results",
    "execution_runs",
    "execution_logs",
    "fnx_testcase_hist",
    "fnx_testcase",
    "fnx_scenario",
    # Case SoT (dependents before parents)
    "fnx_rule_case_hist",
    "fnx_rule_case",
    "fnx_rule_svc",
    # Legacy / dual-write façade
    "service_rules_current",
    "service_rule_history",
    "service_rule_pointers",
    "service_rule_bundles",
    # Other runtime data
    "fnx_pool_sample",
    "fnx_api_operation",
    "fnx_openapi_document",
    "fnx_collection_var_generator",
    "fnx_registered_service",
    "pool_samples",
    "api_operations",
    "openapi_documents",
    "collection_var_generators",
    "registered_services",
    "fnx_rule_doc_hist",
    "fnx_rule_doc_current",
    "fnx_manual_chunk",
    "fnx_manual_index_meta",
    "fnx_service_catalog",
)

_NEVER_DELETE: frozenset[str] = frozenset(
    {
        "service_catalog_items",
        "fnx_service_catalog",
        "fnx_inst",
        "alembic_version",
        "manual_chunks",
        "manual_index_meta",
        "fnx_manual_chunk",
        "fnx_manual_index_meta",
    }
)


async def _existing_tables(session: AsyncSession) -> set[str]:
    def _names(sync_conn) -> set[str]:
        return set(inspect(sync_conn).get_table_names())

    conn = await session.connection()
    return await conn.run_sync(_names)


async def run() -> None:
    from app.db.session import get_session_factory, init_db

    await init_db()
    factory = get_session_factory()

    async with factory() as session:
        present = await _existing_tables(session)
        for table in _PURGE_TABLES:
            if table in _NEVER_DELETE:
                continue
            if table not in present:
                print(f"skip {table}: not present")
                continue
            result = await session.execute(text(f"DELETE FROM {table}"))
            print(f"deleted {table}: {result.rowcount}")
        await session.commit()
        print("kept: service_catalog_items, fnx_inst (and other non-runtime tables)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Purge test/runtime data (never deletes service catalog or fnx_inst)"
    )
    parser.add_argument(
        "--keep-catalog",
        action="store_true",
        help="Deprecated no-op: catalog is always kept",
    )
    _ = parser.parse_args()
    asyncio.run(run())


if __name__ == "__main__":
    main()

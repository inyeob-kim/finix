"""
Remove runtime / test rows from the app database (PostgreSQL or SQLite via .env).

Usage (from backend/):
  python scripts/purge_test_data.py
  python scripts/purge_test_data.py --keep-catalog
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


async def run(*, keep_catalog: bool) -> None:
    from sqlalchemy import text

    from app.db.session import get_session_factory, init_db

    await init_db()
    factory = get_session_factory()

    tables = [
        "execution_step_results",
        "execution_runs",
        "execution_logs",
        "testcases",
        "scenarios",
        "service_rule_pointers",
        "service_rule_bundles",
    ]
    if not keep_catalog:
        tables.append("service_catalog_items")
    tables.append("registered_services")

    async with factory() as session:
        for table in tables:
            result = await session.execute(text(f"DELETE FROM {table}"))
            print(f"deleted {table}: {result.rowcount}")
        await session.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Purge test/runtime data")
    parser.add_argument(
        "--keep-catalog",
        action="store_true",
        help="Keep service_catalog_items (only clear rules, scenarios, executions)",
    )
    args = parser.parse_args()
    asyncio.run(run(keep_catalog=args.keep_catalog))


if __name__ == "__main__":
    main()

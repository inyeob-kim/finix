"""
Align service_rule_bundles.status with service_rule_pointers.active_bundle_id.

- Pointer target: status = active
- Other rows still marked active: status = superseded

Usage (from backend/):
  python scripts/fix_active_bundle_status.py
  python scripts/fix_active_bundle_status.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


async def run(*, dry_run: bool) -> None:
    from app.db.session import get_session_factory, init_db
    from app.repositories.service_rules_repo import ServiceRulesRepository
    from app.services.service_rules_service import ServiceRulesService

    await init_db()
    factory = get_session_factory()

    async with factory() as session:
        repo = ServiceRulesRepository(session)
        service = ServiceRulesService(repo=repo)
        if dry_run:
            pointers = await repo.list_all_pointers()
            bundles = await repo.list_all_bundles(limit=50_000, offset=0)
            by_code: dict[str, list] = {}
            for b in bundles:
                by_code.setdefault(b.service_code, []).append(b)
            would_change = 0
            for code, rows in sorted(by_code.items()):
                ptr = next((p for p in pointers if p.service_code == code), None)
                active_id = ptr.active_bundle_id if ptr else None
                for b in rows:
                    st = (b.status or "").strip().lower()
                    if active_id is not None and b.id == active_id and st != "active":
                        print(f"  {code} #{b.id} v{b.version}: -> active")
                        would_change += 1
                    elif st == "active" and (active_id is None or b.id != active_id):
                        print(f"  {code} #{b.id} v{b.version}: active -> superseded")
                        would_change += 1
            print(f"Dry run: {would_change} bundle row(s) would be updated.")
            return

        totals = await service.reconcile_all_active_statuses()
        await session.commit()
        if not totals:
            print("No rows needed updates.")
            return
        total = sum(totals.values())
        print(f"Updated {total} bundle row(s) across {len(totals)} service(s):")
        for code, n in sorted(totals.items()):
            print(f"  {code}: {n}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fix active/superseded bundle statuses")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned changes without writing",
    )
    args = parser.parse_args()
    asyncio.run(run(dry_run=args.dry_run))


if __name__ == "__main__":
    main()

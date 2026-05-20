"""
Quick manual test for service rule YAML generation.

Usage (from backend/):
  python scripts/test_yaml_generation.py import
  python scripts/test_yaml_generation.py validate PY016
  python scripts/test_yaml_generation.py generate PY016
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


async def cmd_import() -> None:
    from app.core.config import get_settings
    from app.db.session import get_session_factory, init_db
    from app.repositories.cbs_service_catalog_repo import CbsServiceCatalogRepository
    from app.repositories.service_catalog_repo import ServiceCatalogRepository
    from app.services.service_catalog_service import ServiceCatalogService

    await init_db()
    settings = get_settings()
    cbs = CbsServiceCatalogRepository(settings.cbs_service_json_path)
    factory = get_session_factory()
    async with factory() as session:
        svc = ServiceCatalogService(
            catalog_repo=ServiceCatalogRepository(session),
            cbs_json_repo=cbs,
        )
        result = await svc.import_from_cbs_json()
        await session.commit()
        print("import:", result)


async def cmd_validate(service_code: str) -> None:
    from app.db.session import get_session_factory, init_db
    from app.repositories.service_rules_repo import ServiceRulesRepository
    from app.services.service_rules_service import ServiceRulesService

    path = _BACKEND / "app" / "rules_yaml" / f"{service_code}.yaml"
    if not path.exists():
        print(f"file not found: {path}")
        return
    yaml_text = path.read_text(encoding="utf-8")
    await init_db()
    factory = get_session_factory()
    async with factory() as session:
        svc = ServiceRulesService(repo=ServiceRulesRepository(session))
        parsed = svc.validate_yaml_text(yaml_text=yaml_text)
        rules = parsed.get("rules") or []
        print(f"OK service_code={parsed.get('service_code')} rules={len(rules)}")


async def cmd_generate(service_code: str, *, objective: str | None) -> None:
    from app.core.deps import get_llm_client
    from app.db.session import get_session_factory, init_db
    from app.repositories.service_catalog_repo import ServiceCatalogRepository
    from app.repositories.service_rules_repo import ServiceRulesRepository
    from app.services.service_rules_ai_service import ServiceRulesAiService
    from app.services.service_rules_service import ServiceRulesService

    llm = get_llm_client()
    if llm is None:
        print("LLM_API_KEY not set in backend/.env")
        return

    await init_db()
    factory = get_session_factory()
    async with factory() as session:
        ai = ServiceRulesAiService(
            llm=llm,
            catalog_repo=ServiceCatalogRepository(session),
            rules_service=ServiceRulesService(repo=ServiceRulesRepository(session)),
        )
        bundle = await ai.generate_draft(
            service_code=service_code,
            objective=objective
            or "error, business, code 규칙을 각각 1개 이상 포함한 테스트 규칙 YAML",
            include_existing=False,
            created_by="test_yaml_generation.py",
        )
        await session.commit()
        print(f"draft saved: id={bundle.id} version={bundle.version} status={bundle.status}")
        print("--- yaml ---")
        print(bundle.yaml_text)


def main() -> None:
    parser = argparse.ArgumentParser(description="Test YAML generation flow")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("import", help="Import cbs_srvc.json into service catalog DB")
    p_val = sub.add_parser("validate", help="Validate rules_yaml/{code}.yaml")
    p_val.add_argument("service_code")
    p_gen = sub.add_parser("generate", help="LLM generate-draft for service_code")
    p_gen.add_argument("service_code")
    p_gen.add_argument("--objective", default=None)
    args = parser.parse_args()

    if args.cmd == "import":
        asyncio.run(cmd_import())
    elif args.cmd == "validate":
        asyncio.run(cmd_validate(args.service_code))
    elif args.cmd == "generate":
        asyncio.run(cmd_generate(args.service_code, objective=args.objective))


if __name__ == "__main__":
    main()

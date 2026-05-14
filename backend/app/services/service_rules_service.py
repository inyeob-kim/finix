"""Business logic for DB-primary YAML rules (validate/version/activate/rollback)."""

from __future__ import annotations

import hashlib
import json
from typing import Any

import yaml

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.models.service_rule_bundle import ServiceRuleBundle
from app.repositories.service_rules_repo import ServiceRulesRepository


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _validate_and_parse_yaml(yaml_text: str) -> dict[str, Any]:
    try:
        payload = yaml.safe_load(yaml_text) or {}
    except Exception as e:  # noqa: BLE001
        raise InvalidInputError(f"YAML 파싱 실패: {e}") from e
    if not isinstance(payload, dict):
        raise InvalidInputError("YAML 최상위는 object(map) 형태여야 합니다.")
    rules = payload.get("rules") or []
    if not isinstance(rules, list):
        raise InvalidInputError("YAML의 rules는 list 형태여야 합니다.")
    # Optional minimal validation for rule_id uniqueness when present.
    seen: set[str] = set()
    for idx, r in enumerate(rules):
        if not isinstance(r, dict):
            raise InvalidInputError(f"rules[{idx}]는 object(map) 형태여야 합니다.")
        rid = r.get("rule_id")
        if not (isinstance(rid, str) and rid.strip()):
            raise InvalidInputError(f"rules[{idx}].rule_id가 필요합니다.")
        rid2 = rid.strip()
        if rid2 in seen:
            raise InvalidInputError(f"rule_id 중복: {rid2}")
        seen.add(rid2)

        rtype = r.get("rule_type")
        if not (isinstance(rtype, str) and rtype.strip()):
            raise InvalidInputError(f"rules[{idx}].rule_type가 필요합니다.")
        if rtype.strip() not in {"error", "business", "code"}:
            raise InvalidInputError(
                f"rules[{idx}].rule_type는 error|business|code 중 하나여야 합니다."
            )

        title = r.get("title")
        if not (isinstance(title, str) and title.strip()):
            raise InvalidInputError(f"rules[{idx}].title이 필요합니다.")

        minimal_input = r.get("minimal_input")
        if minimal_input is not None and not isinstance(minimal_input, dict):
            raise InvalidInputError(f"rules[{idx}].minimal_input은 object(map) 형태여야 합니다.")

        expect = r.get("expect")
        if not isinstance(expect, dict):
            raise InvalidInputError(f"rules[{idx}].expect는 object(map) 형태여야 합니다.")
        if "http_status" in expect:
            try:
                int(expect.get("http_status"))
            except Exception as e:  # noqa: BLE001
                raise InvalidInputError(
                    f"rules[{idx}].expect.http_status는 int 여야 합니다."
                ) from e

    # Coverage policy: must contain all three rule types at least once.
    types_present = {str(r.get("rule_type")).strip() for r in rules if isinstance(r, dict)}
    missing = {"error", "business", "code"} - types_present
    if missing:
        raise InvalidInputError(f"rules에 필수 rule_type이 누락되었습니다: {sorted(missing)}")
    return payload


class ServiceRulesService:
    """Workflow for rule bundles."""

    def __init__(self, *, repo: ServiceRulesRepository) -> None:
        self._repo = repo

    async def create_draft(
        self,
        *,
        service_code: str,
        yaml_text: str,
        source_version: str | None,
        created_by: str | None,
    ) -> ServiceRuleBundle:
        code = (service_code or "").strip()
        if not code:
            raise InvalidInputError("service_code가 필요합니다.")
        if not (yaml_text or "").strip():
            raise InvalidInputError("yaml_text가 비어있습니다.")

        parsed = _validate_and_parse_yaml(yaml_text)
        version = await self._repo.next_version(code)
        bundle = ServiceRuleBundle(
            service_code=code,
            service_name_snapshot=str(parsed.get("service_name") or "") or None,
            status="draft",
            version=version,
            source_version=(source_version or None),
            yaml_text=yaml_text,
            rules_json=json.dumps(parsed, ensure_ascii=False),
            checksum=_sha256_text(yaml_text),
            created_by=created_by,
        )
        return await self._repo.create_bundle(bundle)

    async def list_versions(self, service_code: str) -> list[ServiceRuleBundle]:
        return await self._repo.list_versions(service_code)

    async def get_active(self, service_code: str) -> ServiceRuleBundle | None:
        return await self._repo.get_active_bundle(service_code)

    async def approve(self, bundle_id: int) -> ServiceRuleBundle:
        bundle = await self._repo.get_bundle(bundle_id)
        if bundle is None:
            raise EntityNotFoundError("ServiceRuleBundle", bundle_id)
        bundle.status = "approved"
        await self._repo.set_approved(bundle.service_code, bundle.id)
        return bundle

    async def activate(self, bundle_id: int) -> ServiceRuleBundle:
        bundle = await self._repo.get_bundle(bundle_id)
        if bundle is None:
            raise EntityNotFoundError("ServiceRuleBundle", bundle_id)
        bundle.status = "active"
        await self._repo.set_active(bundle.service_code, bundle.id)
        return bundle

    async def rollback(self, *, service_code: str, to_version: int) -> ServiceRuleBundle:
        bundle = await self._repo.get_bundle_by_version(service_code=service_code, version=to_version)
        if bundle is None:
            raise EntityNotFoundError("ServiceRuleBundleVersion", f"{service_code}:{to_version}")
        bundle.status = "active"
        await self._repo.set_active(bundle.service_code, bundle.id)
        return bundle


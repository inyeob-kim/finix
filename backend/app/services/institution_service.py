"""Institution master and mock login binding."""

from __future__ import annotations

from typing import Any

from app.core.exceptions import EntityNotFoundError, InvalidInputError
from app.domain.inst_scope import DEFAULT_INST_CD, require_inst_cd
from app.models.fnx_inst import FnxInst
from app.repositories.institution_repo import InstitutionRepository

DEFAULT_INST_NM = "FINIX 기본"
ALLOWED_ROLES = frozenset({"qa.editor", "qa.approver"})


def institution_to_dict(row: FnxInst) -> dict[str, Any]:
    return {
        "inst_cd": row.inst_cd,
        "inst_nm": row.inst_nm,
        "is_active": bool(row.is_active),
        "remark": row.remark,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


class InstitutionService:
    """Business logic for institutions and login institution checks."""

    def __init__(self, repo: InstitutionRepository) -> None:
        self._repo = repo

    async def ensure_default(self) -> FnxInst:
        """Idempotently seed DEFAULT_INST_CD for local / SQLite boots."""
        existing = await self._repo.get(DEFAULT_INST_CD)
        if existing is not None:
            return existing
        return await self._repo.create(
            inst_cd=DEFAULT_INST_CD,
            inst_nm=DEFAULT_INST_NM,
            is_active=True,
            remark="bootstrap seed",
        )

    async def list_active(self) -> list[dict[str, Any]]:
        rows = await self._repo.list_active()
        return [institution_to_dict(r) for r in rows]

    async def list_all(self) -> list[dict[str, Any]]:
        rows = await self._repo.list_all()
        return [institution_to_dict(r) for r in rows]

    async def get(self, inst_cd: str) -> dict[str, Any]:
        code = require_inst_cd(inst_cd)
        row = await self._repo.get(code)
        if row is None:
            raise EntityNotFoundError("FnxInst", code)
        return institution_to_dict(row)

    async def create(
        self,
        *,
        inst_cd: str,
        inst_nm: str,
        is_active: bool = True,
        remark: str | None = None,
    ) -> dict[str, Any]:
        code = require_inst_cd(inst_cd)
        name = (inst_nm or "").strip()
        if not name:
            raise InvalidInputError("inst_nm(기관명)이 필요합니다.")
        existing = await self._repo.get(code)
        if existing is not None:
            raise InvalidInputError(f"이미 존재하는 기관코드입니다: {code}")
        row = await self._repo.create(
            inst_cd=code,
            inst_nm=name,
            is_active=is_active,
            remark=remark,
        )
        return institution_to_dict(row)

    async def assert_active(self, inst_cd: str | None) -> str:
        """
        Require a non-empty, existing, active institution code.

        Returns:
            Normalized inst_cd.
        """
        code = require_inst_cd(inst_cd)
        row = await self._repo.get(code)
        if row is None:
            raise EntityNotFoundError("FnxInst", code)
        if not row.is_active:
            raise InvalidInputError(f"비활성 기관입니다: {code}")
        return code

    async def login(
        self,
        *,
        username: str,
        role: str,
        inst_cd: str,
    ) -> dict[str, Any]:
        """
        Mock login: validate institution + role; password is ignored by design.
        """
        code = await self.assert_active(inst_cd)
        user = (username or "").strip()
        if not user:
            raise InvalidInputError("username이 필요합니다.")
        normalized_role = (role or "").strip()
        if normalized_role not in ALLOWED_ROLES:
            raise InvalidInputError(
                f"role은 {', '.join(sorted(ALLOWED_ROLES))} 중 하나여야 합니다."
            )
        row = await self._repo.get(code)
        assert row is not None  # assert_active already checked
        return {
            "username": user,
            "role": normalized_role,
            "inst_cd": row.inst_cd,
            "inst_nm": row.inst_nm,
        }

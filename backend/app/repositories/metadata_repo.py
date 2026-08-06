"""Async data access for scenarios and legacy execution logs."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fnx_execution_log import ExecutionLog
from app.models.fnx_scenario import Scenario


class MetadataRepository:
    """Repository for domain entities stored as structured metadata rows."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with an async SQLAlchemy session."""
        self._session = session

    async def create_scenario(
        self,
        *,
        title: str,
        description: str | None = None,
        content: str | None = None,
        prompt: str | None = None,
        steps_json: str | None = None,
        is_saved: bool = False,
        inst_cd: str | None = None,
    ) -> Scenario:
        """Insert a new scenario row."""
        from app.domain.inst_scope import DEFAULT_INST_CD, require_inst_cd

        entity = Scenario(
            inst_cd=require_inst_cd(inst_cd or DEFAULT_INST_CD),
            title=title,
            description=description,
            content=content,
            prompt=prompt,
            steps_json=steps_json,
            is_saved=is_saved,
        )
        self._session.add(entity)
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

    async def get_scenario_by_id(self, scenario_id: int) -> Scenario | None:
        """Load a scenario by primary key."""
        result = await self._session.execute(
            select(Scenario).where(Scenario.id == scenario_id)
        )
        return result.scalar_one_or_none()

    async def list_scenarios(
        self,
        *,
        saved_only: bool | None,
        limit: int,
        offset: int,
        inst_cd: str | None = None,
    ) -> tuple[list[Scenario], int]:
        """Return scenarios with optional saved/inst filter and total count."""
        from app.domain.inst_scope import DEFAULT_INST_CD, require_inst_cd

        filters = [Scenario.inst_cd == require_inst_cd(inst_cd or DEFAULT_INST_CD)]
        if saved_only is True:
            filters.append(Scenario.is_saved.is_(True))
        elif saved_only is False:
            filters.append(Scenario.is_saved.is_(False))

        count_q = select(func.count()).select_from(Scenario)
        list_q = select(Scenario)
        for f in filters:
            count_q = count_q.where(f)
            list_q = list_q.where(f)

        total = int((await self._session.execute(count_q)).scalar_one())
        list_q = list_q.order_by(Scenario.id.desc()).offset(offset).limit(limit)
        rows = list((await self._session.execute(list_q)).scalars().all())
        return rows, total

    async def update_scenario_fields(
        self,
        scenario_id: int,
        *,
        title: str | None = None,
        description: str | None = None,
        content: str | None = None,
        prompt: str | None = None,
        steps_json: str | None = None,
        is_saved: bool | None = None,
    ) -> Scenario | None:
        """Patch known fields on a scenario. Returns None if missing."""
        entity = await self.get_scenario_by_id(scenario_id)
        if entity is None:
            return None
        if title is not None:
            entity.title = title
        if description is not None:
            entity.description = description
        if content is not None:
            entity.content = content
        if prompt is not None:
            entity.prompt = prompt
        if steps_json is not None:
            entity.steps_json = steps_json
        if is_saved is not None:
            entity.is_saved = is_saved
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

    async def create_execution_log(
        self,
        *,
        status: str,
        detail: str | None,
        inst_cd: str | None = None,
        svc_code: str | None = None,
        rule_case_id: str | None = None,
    ) -> ExecutionLog:
        """Persist a single-testcase execution log row."""
        from app.domain.inst_scope import DEFAULT_INST_CD, require_inst_cd

        entity = ExecutionLog(
            inst_cd=require_inst_cd(inst_cd or DEFAULT_INST_CD),
            svc_code=(svc_code or "").strip() or None,
            rule_case_id=(rule_case_id or "").strip() or None,
            status=status,
            detail=detail,
        )
        self._session.add(entity)
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

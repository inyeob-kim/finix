"""Async data access for scenarios, test cases, and legacy execution logs."""

from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.execution_log import ExecutionLog
from app.models.scenario import Scenario
from app.models.service_rule_bundle import ServiceRuleBundle
from app.models.testcase import TestCase

_UNSET = object()


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
    ) -> Scenario:
        """Insert a new scenario row."""
        entity = Scenario(
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
    ) -> tuple[list[Scenario], int]:
        """Return scenarios with optional saved filter and total count."""
        filters = []
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

    async def create_testcase(
        self,
        *,
        name: str,
        steps: str | None = None,
        scenario_id: int | None = None,
        http_method: str | None = None,
        endpoint: str | None = None,
        request_body_json: str | None = None,
        expected_status: int | None = None,
        expected_body_json: str | None = None,
        step_index: int | None = None,
        rule_bundle_id: int | None = None,
    ) -> TestCase:
        """Insert a new test case row."""
        entity = TestCase(
            name=name,
            steps=steps,
            scenario_id=scenario_id,
            http_method=http_method,
            endpoint=endpoint,
            request_body_json=request_body_json,
            expected_status=expected_status,
            expected_body_json=expected_body_json,
            step_index=step_index,
            rule_bundle_id=rule_bundle_id,
        )
        self._session.add(entity)
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

    async def get_testcase_by_id(self, testcase_id: int) -> TestCase | None:
        """Load a test case by primary key."""
        result = await self._session.execute(
            select(TestCase).where(TestCase.id == testcase_id)
        )
        return result.scalar_one_or_none()

    async def list_testcases_for_scenario(self, scenario_id: int) -> list[TestCase]:
        """Return test cases for a scenario ordered by step_index then id."""
        stmt = (
            select(TestCase)
            .where(TestCase.scenario_id == scenario_id)
            .order_by(TestCase.step_index.asc(), TestCase.id.asc())
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def list_testcases_for_service_code(
        self, service_code: str, *, limit: int = 200
    ) -> list[TestCase]:
        """Return persisted HTTP test cases tied to a service (name prefix or rule bundle)."""
        code = (service_code or "").strip()
        if not code:
            return []
        prefix = f"{code} "
        stmt = (
            select(TestCase)
            .outerjoin(
                ServiceRuleBundle,
                TestCase.rule_bundle_id == ServiceRuleBundle.id,
            )
            .where(
                or_(
                    TestCase.name.startswith(prefix),
                    ServiceRuleBundle.service_code == code,
                )
            )
            .order_by(TestCase.id.desc())
            .limit(limit)
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def delete_testcases_for_scenario(self, scenario_id: int) -> int:
        """Remove all test cases linked to a scenario. Returns deleted count."""
        result = await self._session.execute(
            delete(TestCase).where(TestCase.scenario_id == scenario_id)
        )
        return result.rowcount or 0

    async def delete_testcases_pool_for_service(self, service_code: str) -> int:
        """Remove pool test cases (no scenario) for one service code."""
        code = (service_code or "").strip()
        if not code:
            return 0
        prefix = f"{code} "
        bundle_id_subq = select(ServiceRuleBundle.id).where(ServiceRuleBundle.service_code == code)
        result = await self._session.execute(
            delete(TestCase).where(
                TestCase.scenario_id.is_(None),
                or_(
                    TestCase.name.startswith(prefix),
                    TestCase.rule_bundle_id.in_(bundle_id_subq),
                ),
            )
        )
        return result.rowcount or 0

    async def update_testcase_fields(
        self,
        testcase_id: int,
        *,
        name: str | None = None,
        http_method: str | None = None,
        endpoint: str | None = None,
        request_body_json: str | None = None,
        expected_status: int | None = None,
        expected_body_json: str | None = None,
        step_index: int | None = None,
        steps: str | None = None,
        scenario_id: Any = _UNSET,
    ) -> TestCase | None:
        """Patch fields on a test case."""
        entity = await self.get_testcase_by_id(testcase_id)
        if entity is None:
            return None
        if name is not None:
            entity.name = name
        if http_method is not None:
            entity.http_method = http_method
        if endpoint is not None:
            entity.endpoint = endpoint
        if request_body_json is not None:
            entity.request_body_json = request_body_json
        if expected_status is not None:
            entity.expected_status = expected_status
        if expected_body_json is not None:
            entity.expected_body_json = expected_body_json
        if step_index is not None:
            entity.step_index = step_index
        if steps is not None:
            entity.steps = steps
        if scenario_id is not _UNSET:
            entity.scenario_id = scenario_id  # type: ignore[assignment]
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

    async def create_execution_log(
        self,
        *,
        testcase_id: int,
        status: str,
        detail: str | None,
    ) -> ExecutionLog:
        """Persist a legacy single-testcase execution log row."""
        entity = ExecutionLog(
            testcase_id=testcase_id,
            status=status,
            detail=detail,
        )
        self._session.add(entity)
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

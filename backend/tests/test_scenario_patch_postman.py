"""ScenarioService.patch_scenario postman-only persistence."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

from app.models.fnx_scenario import Scenario
from app.services.scenario_service import ScenarioService
from app.utils.json_text import dumps_json, loads_json


def test_patch_scenario_postman_only_merges_into_existing_steps():
    existing = Scenario(
        id=7,
        title="T",
        prompt="p",
        steps_json=dumps_json(
            {
                "version": 2,
                "steps": [{"number": 1, "action": "A", "result": "success"}],
                "postman": {"base_url": "http://old"},
            },
        ),
    )
    updated = Scenario(
        id=7,
        title="T",
        prompt="p",
        steps_json="{}",
    )
    meta = MagicMock()
    meta.get_scenario_by_id = AsyncMock(return_value=existing)
    meta.update_scenario_fields = AsyncMock(return_value=updated)

    svc = ScenarioService(
        metadata_repo=meta,
        registry_repo=MagicMock(),
        cbs_catalog_repo=MagicMock(),
        llm_client=None,
    )
    asyncio.run(
        svc.patch_scenario(
            7,
            title=None,
            prompt=None,
            steps=None,
            postman={
                "base_url": "http://new",
                "start_vars": [{"key": "a", "value": "1"}],
            },
        ),
    )

    meta.update_scenario_fields.assert_awaited_once()
    kwargs = meta.update_scenario_fields.await_args.kwargs
    raw = loads_json(kwargs["steps_json"], {})
    assert raw["version"] == 2
    assert raw["steps"][0]["action"] == "A"
    assert raw["postman"]["base_url"] == "http://new"
    assert raw["postman"]["start_vars"][0]["key"] == "a"

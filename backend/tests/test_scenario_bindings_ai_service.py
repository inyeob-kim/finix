"""Tests for heuristic scenario binding suggestions."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

from app.services.scenario_bindings_ai_service import ScenarioBindingsAiService


def test_heuristic_suggest_adjacent_matching_fields():
    catalog = MagicMock()
    catalog.get_dto_skeletons = AsyncMock(
        side_effect=[
            {
                "service_code": "SVC_A",
                "input_skeleton": {"acctNo": None},
                "output_skeleton": {"arrId": None, "token": None},
                "input_field_count": 1,
                "output_field_count": 2,
            },
            {
                "service_code": "SVC_B",
                "input_skeleton": {"arrId": None, "custNm": None},
                "output_skeleton": {"resultCd": None},
                "input_field_count": 2,
                "output_field_count": 1,
            },
        ]
    )
    cbs = MagicMock()
    cbs.get_raw_row_by_service_code = AsyncMock(
        side_effect=[
            {"service_code": "SVC_A", "service_name": "A"},
            {"service_code": "SVC_B", "service_name": "B"},
        ]
    )
    svc = ScenarioBindingsAiService(
        catalog_service=catalog,
        cbs_repo=cbs,
        llm=None,
    )
    result = asyncio.run(svc.suggest(service_codes=["SVC_A", "SVC_B"]))
    assert result.link_count >= 1
    assert "SVC_A" in result.bindings_by_service
    assert "SVC_B" in result.bindings_by_service
    b_extracts = result.bindings_by_service["SVC_A"].extracts
    b_injects = result.bindings_by_service["SVC_B"].injects
    assert any(e.var == "arrId" for e in b_extracts)
    assert any(i.var == "arrId" for i in b_injects)
    assert result.source == "heuristic"


def test_single_service_returns_empty_links():
    catalog = MagicMock()
    catalog.get_dto_skeletons = AsyncMock(
        return_value={
            "input_skeleton": {},
            "output_skeleton": {},
            "input_field_count": 0,
            "output_field_count": 0,
        }
    )
    cbs = MagicMock()
    cbs.get_raw_row_by_service_code = AsyncMock(return_value={"service_code": "ONLY"})
    svc = ScenarioBindingsAiService(catalog_service=catalog, cbs_repo=cbs, llm=None)
    result = asyncio.run(svc.suggest(service_codes=["ONLY"]))
    assert result.link_count == 0

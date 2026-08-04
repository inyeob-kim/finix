"""Async tests: DTO atr dump merges into catalog field index."""

import asyncio
import json
from pathlib import Path

from app.repositories.cbs_service_catalog_repo import CbsServiceCatalogRepository
from app.utils.rule_input_omm_skeleton import skeleton_from_catalog_row


def test_build_dto_fields_index_prefers_dto_atr_dump(tmp_path: Path):
    srvc = {
        "rows": [
            {
                "service_code": "PY025",
                "service_name": "auto sweep",
                "http_method": "POST",
                "endpoint_uri": "/api/x",
                "output_dto_name": "AutoSweepOut",
                "output_fields": [
                    {
                        "field_name": "outList",
                        "list_flag": "Y",
                        "nested_dto_class_name": "AutoSweepCcRsltInqrySvcOutSub",
                    },
                ],
            },
        ],
    }
    srvc_path = tmp_path / "cbs_srvc.json"
    srvc_path.write_text(json.dumps(srvc), encoding="utf-8")

    atr = [
        {
            "class_name": "AutoSweepCcRsltInqrySvcOutSub",
            "fields": [
                {"field_name": "dt", "list_flag": "N"},
                {"field_name": "amt", "list_flag": "N"},
            ],
        },
    ]
    atr_path = tmp_path / "cbs_dto_atr.json"
    atr_path.write_text(json.dumps(atr), encoding="utf-8")

    repo = CbsServiceCatalogRepository(
        str(srvc_path),
        dto_atr_json_path=str(atr_path),
    )
    index = asyncio.run(repo.build_dto_fields_index())
    assert "dt" in {f["field_name"] for f in index["AutoSweepCcRsltInqrySvcOutSub"]}

    row = asyncio.run(repo.get_raw_row_by_service_code("PY025"))
    sk = skeleton_from_catalog_row(row, kind="output", dto_fields_by_class=index)
    assert sk["outList"] == [{"dt": None, "amt": None}]

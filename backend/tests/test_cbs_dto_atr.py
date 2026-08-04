"""Tests for CBS DTO attribute dump parsing and skeleton expansion."""

from pathlib import Path

from app.domain.cbs_dto_atr import load_dto_atr_index, parse_dto_atr_payload
from app.utils.rule_input_omm_skeleton import skeleton_from_fields_list


def test_parse_dto_atr_class_wrapper_list():
    payload = [
        {
            "class_name": "AutoSweepCcRsltInqrySvcOutSub",
            "fields": [
                {"field_name": "dt", "list_flag": "N"},
                {"field_name": "amt", "list_flag": "N"},
            ],
        },
    ]
    idx = parse_dto_atr_payload(payload)
    assert "AutoSweepCcRsltInqrySvcOutSub" in idx
    names = [f["field_name"] for f in idx["AutoSweepCcRsltInqrySvcOutSub"]]
    assert names == ["dt", "amt"]


def test_parse_dto_atr_dict_by_class():
    idx = parse_dto_atr_payload(
        {"SubOut": [{"field_name": "code", "LIST_DTO_YN": "N"}]},
    )
    assert idx["SubOut"][0]["field_name"] == "code"


def test_parse_dto_atr_flat_rows_grouped():
    idx = parse_dto_atr_payload(
        [
            {"CLASS_NM": "RowOut", "ATR_NM": "a", "LIST_DTO_YN": "N"},
            {"CLASS_NM": "RowOut", "ATR_NM": "b", "LIST_DTO_YN": "N"},
        ],
    )
    assert [f["field_name"] for f in idx["RowOut"]] == ["a", "b"]


def test_load_dto_atr_index_missing_file(tmp_path: Path):
    assert load_dto_atr_index(tmp_path / "nope.json") == {}


def test_load_dto_atr_index_file(tmp_path: Path):
    path = tmp_path / "cbs_dto_atr.json"
    path.write_text(
        '[{"class_name":"X","fields":[{"field_name":"id"}]}]',
        encoding="utf-8",
    )
    idx = load_dto_atr_index(path)
    assert idx["X"][0]["field_name"] == "id"


def test_skeleton_uses_dto_atr_for_nested_list():
    fields = [
        {
            "field_name": "outList",
            "list_flag": "Y",
            "nested_dto_class_name": "AutoSweepCcRsltInqrySvcOutSub",
        },
    ]
    dto_index = parse_dto_atr_payload(
        [
            {
                "class_name": "AutoSweepCcRsltInqrySvcOutSub",
                "fields": [
                    {"field_name": "dt"},
                    {"field_name": "amt"},
                ],
            },
        ],
    )
    sk = skeleton_from_fields_list(fields, dto_fields_by_class=dto_index)
    assert sk["outList"] == [{"dt": None, "amt": None}]

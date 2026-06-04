"""Postman collection variable list builder."""

from app.domain.postman_collection_config import PostmanCollectionConfig, PostmanStartVarSpec
from app.domain.postman_collection_variables import build_postman_collection_variables


def test_build_postman_collection_variables_merges_base_start_and_runtime():
    cfg = PostmanCollectionConfig(
        base_url="https://api.test",
        start_vars=[PostmanStartVarSpec(key="custId", value="C-1")],
    )
    rows = build_postman_collection_variables(
        cfg,
        runtime_var_names=["arrIdNbr", "custId"],
    )
    keys = [r["key"] for r in rows]
    assert keys == ["baseUrl", "custId", "arrIdNbr"]
    assert rows[0]["value"] == "https://api.test"
    assert rows[1]["value"] == "C-1"
    assert rows[2]["value"] == ""


def test_build_postman_collection_variables_always_includes_base_url_key():
    rows = build_postman_collection_variables(None, runtime_var_names=[])
    assert rows == [{"key": "baseUrl", "value": "", "type": "string"}]

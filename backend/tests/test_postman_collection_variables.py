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
    assert keys[0] == "baseUrl"
    assert "instCd" not in keys
    assert "custId" in keys
    assert "arrIdNbr" in keys
    assert rows[0]["value"] == "https://api.test"
    cust = next(r for r in rows if r["key"] == "custId")
    assert cust["value"] == "C-1"
    arr = next(r for r in rows if r["key"] == "arrIdNbr")
    assert arr["value"] == ""


def test_build_postman_collection_variables_base_url_only_by_default():
    rows = build_postman_collection_variables(None, runtime_var_names=[])
    keys = [r["key"] for r in rows]
    assert keys == ["baseUrl"]


def test_build_postman_collection_variables_resolves_shared_catalog_generator():
    from app.domain.collection_var_generators import CatalogGeneratorSpec

    cfg = PostmanCollectionConfig(
        base_url="https://api.test",
        start_vars=[
            PostmanStartVarSpec(key="enName", value="", generator="english_first_name"),
        ],
    )
    catalog = {
        "english_first_name": CatalogGeneratorSpec(
            key="english_first_name",
            impl_kind="pick_from_list",
            impl={"values": ["Alice", "Bob"]},
        ),
    }
    rows = build_postman_collection_variables(
        cfg,
        runtime_var_names=[],
        catalog=catalog,
    )
    en = next(r for r in rows if r["key"] == "enName")
    assert en["value"] in ("Alice", "Bob")

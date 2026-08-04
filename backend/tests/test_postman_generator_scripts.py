"""Postman pre-request scripts for collection start-var generators."""

from app.domain.collection_var_generators import CatalogGeneratorSpec
from app.domain.postman_collection_config import (
    PostmanCollectionConfig,
    PostmanStartVarSpec,
)
from app.domain.postman_generator_scripts import (
    build_start_var_generator_exec_lines,
    merge_collection_prerequest_events,
)


def test_build_start_var_generator_scripts_for_builtin_and_pick_list():
    cfg = PostmanCollectionConfig(
        start_vars=[
            PostmanStartVarSpec(key="custNm", value="", generator="uuid"),
            PostmanStartVarSpec(key="enName", value="", generator="english_first_name"),
            PostmanStartVarSpec(key="fixed", value="X", generator=None),
        ],
    )
    catalog = {
        "english_first_name": CatalogGeneratorSpec(
            key="english_first_name",
            impl_kind="pick_from_list",
            impl={"values": ["Alice", "Bob", "Carol"]},
        ),
    }
    lines = build_start_var_generator_exec_lines(cfg, catalog=catalog)
    text = "\n".join(lines)
    assert "__finixFirst" in text
    assert 'pm.collectionVariables.set("custNm"' in text
    assert 'pm.collectionVariables.set("enName"' in text
    assert "Alice" in text
    assert "fixed" not in text


def test_merge_collection_prerequest_events_concatenates_exec():
    a = {
        "listen": "prerequest",
        "script": {"type": "text/javascript", "exec": ["// a", "var x = 1;"]},
    }
    b = {
        "listen": "prerequest",
        "script": {"type": "text/javascript", "exec": ["// b"]},
    }
    merged = merge_collection_prerequest_events(a, b)
    assert len(merged) == 1
    exec_lines = merged[0]["script"]["exec"]
    assert exec_lines[0] == "// a"
    assert "// b" in exec_lines

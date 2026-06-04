"""Scenario steps_json envelope with Postman config."""

from app.domain.postman_collection_config import PostmanCollectionConfig, PostmanStartVarSpec
from app.utils.json_text import loads_json
from app.utils.scenario_steps_document import dump_steps_document, parse_steps_document


def test_parse_legacy_array_steps():
    raw = [{"number": 1, "action": "A", "result": "success"}]
    steps, postman = parse_steps_document(dump_steps_document(raw))
    assert len(steps) == 1
    assert postman is None


def test_roundtrip_envelope_with_postman():
    steps = [{"number": 1, "action": "A", "result": "success"}]
    postman = PostmanCollectionConfig(
        base_url="https://host",
        start_vars=[PostmanStartVarSpec(key="x", value="1")],
    )
    blob = dump_steps_document(steps, postman)
    parsed = loads_json(blob, {})
    assert parsed["version"] == 2
    out_steps, out_postman = parse_steps_document(blob)
    assert len(out_steps) == 1
    assert out_postman is not None
    assert out_postman.base_url == "https://host"
    assert out_postman.start_vars[0].key == "x"

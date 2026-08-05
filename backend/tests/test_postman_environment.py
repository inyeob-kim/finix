"""Tests for Postman environment / collection variable substitution."""

import pytest

from app.domain.postman_collection_parse import parse_collection_requests
from app.domain.postman_environment import (
    build_var_map_for_import,
    classify_postman_json,
    format_substitute_notes,
    merge_var_maps,
    parse_collection_variables,
    parse_environment_values,
    prepare_collection_for_import,
    substitute_plain_vars_in_text,
)


def test_classify_environment_and_collection():
    env = {
        "id": "e1",
        "name": "local",
        "values": [{"key": "custId", "value": "C001", "enabled": True}],
        "_postman_variable_scope": "environment",
    }
    coll = {
        "info": {
            "name": "col",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "item": [],
    }
    assert classify_postman_json(env) == "environment"
    assert classify_postman_json(coll) == "collection"
    assert classify_postman_json(
        {"name": "r", "request": {"method": "POST", "url": "/x"}}
    ) == "request"


def test_env_overrides_collection_vars():
    coll_vars = parse_collection_variables(
        {
            "variable": [
                {"key": "custId", "value": "TEMP", "enabled": True},
                {"key": "baseUrl", "value": "http://localhost", "enabled": True},
            ]
        }
    )
    env_vars = parse_environment_values(
        {
            "values": [
                {"key": "custId", "value": "C001", "enabled": True},
                {"key": "skip", "value": "x", "enabled": False},
            ]
        }
    )
    merged = merge_var_maps(collection_vars=coll_vars, environment_vars=env_vars)
    assert merged["custId"] == "C001"
    assert merged["baseUrl"] == "http://localhost"
    assert "skip" not in merged


def test_substitute_plain_vars_skips_finix_macros():
    text = '{"a":"{{custId}}","b":"{{$date.today()}}","c":"{{pool.x}}"}'
    out, n, unresolved = substitute_plain_vars_in_text(
        text, {"custId": "C001"}
    )
    assert '"a":"C001"' in out
    assert "{{$date.today()}}" in out
    assert "{{pool.x}}" in out
    assert n == 1
    assert unresolved == set()


def test_prepare_collection_substitutes_body():
    collection = {
        "info": {"name": "col", "schema": "collection"},
        "variable": [{"key": "custId", "value": "TEMP", "enabled": True}],
        "item": [
            {
                "name": "pay",
                "request": {
                    "method": "POST",
                    "url": "{{baseUrl}}/Payment/PY016",
                    "body": {
                        "mode": "raw",
                        "raw": '{"custId":"{{custId}}","dt":"{{$date.today()}}"}',
                    },
                },
            }
        ],
    }
    environment = {
        "values": [
            {"key": "custId", "value": "C001", "enabled": True},
            {"key": "baseUrl", "value": "http://api", "enabled": True},
        ]
    }
    prepared = prepare_collection_for_import(collection, environment)
    rows = parse_collection_requests(prepared.document)
    assert len(rows) == 1
    assert rows[0].body["custId"] == "C001"
    assert rows[0].body["dt"] == "{{$date.today()}}"
    assert rows[0].path == "/Payment/PY016"
    assert prepared.resolved_count >= 2
    notes = format_substitute_notes(prepared)
    assert any("치환" in n for n in notes)


def test_environment_only_raises():
    env = {
        "values": [{"key": "a", "value": "1", "enabled": True}],
        "_postman_variable_scope": "environment",
    }
    with pytest.raises(ValueError, match="Collection"):
        prepare_collection_for_import(env, None)


def test_build_var_map_without_environment():
    coll = {
        "variable": [{"key": "x", "value": "1", "enabled": True}],
        "item": [],
    }
    assert build_var_map_for_import(coll, None) == {"x": "1"}

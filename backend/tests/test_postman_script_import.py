"""Tests for Postman script → Finix macro import mapping (AI + RAG path)."""

from unittest.mock import AsyncMock

from app.domain.postman_collection_parse import parse_collection_requests
from app.domain.postman_environment import prepare_collection_for_import
from app.domain.postman_script_import import (
    ScriptVarIntent,
    build_auto_overrides,
    build_script_import_plan,
    extract_js_bindings,
    extract_script_assignments,
    extract_set_assignments,
    merge_ai_intent_overrides,
    resolve_expr,
)
from app.services.collection_var_generator_rag_service import (
    CollectionVarGeneratorRagService,
    assignment_query_text,
    catalog_card_embed_text,
)


def test_extract_set_assignments_parses_nested_calls():
    script = """
    pm.environment.set("txnId", uuid.v4());
    pm.variables.set('acctNo', makeAcct());
    pm.collectionVariables.set("channel", "BXM");
    """
    rows = extract_set_assignments(script)
    by_name = {n: rhs for n, rhs in rows}
    assert "uuid.v4()" in by_name["txnId"]
    assert "makeAcct()" in by_name["acctNo"]
    assert by_name["channel"].strip('"') == "BXM" or '"BXM"' in by_name["channel"]


def test_extract_literals_auto_dynamics_need_ai():
    collection = {
        "info": {"name": "col", "schema": "collection"},
        "item": [
            {
                "name": "pay",
                "event": [
                    {
                        "listen": "prerequest",
                        "script": {
                            "exec": [
                                'pm.variables.set("txnId", uuid.v4());',
                                'pm.variables.set("channel", "BXM");',
                            ]
                        },
                    }
                ],
                "request": {"method": "POST", "url": "/x", "body": {"mode": "raw", "raw": "{}"}},
            }
        ],
    }
    intents = extract_script_assignments(collection)
    by_name = {i.name: i for i in intents}
    assert by_name["channel"].kind == "literal"
    assert by_name["channel"].apply == "auto"
    assert by_name["channel"].rhs == "BXM"
    assert by_name["txnId"].kind == "unknown"
    assert by_name["txnId"].apply == "needs_review"


def test_script_overrides_win_via_ai_merge():
    collection = {
        "info": {"name": "col", "schema": "collection"},
        "item": [
            {
                "name": "pay",
                "event": [
                    {
                        "listen": "prerequest",
                        "script": {
                            "exec": [
                                'pm.variables.set("txnId", uuid.v4());',
                                'pm.variables.set("fixed", "FROM_SCRIPT");',
                            ]
                        },
                    }
                ],
                "request": {
                    "method": "POST",
                    "url": "/Payment/PY016",
                    "body": {
                        "mode": "raw",
                        "raw": '{"txnId":"{{txnId}}","fixed":"{{fixed}}","custId":"{{custId}}"}',
                    },
                },
            }
        ],
    }
    environment = {
        "values": [
            {"key": "txnId", "value": "HARDCODED-UUID", "enabled": True},
            {"key": "custId", "value": "C001", "enabled": True},
        ]
    }
    intents = extract_script_assignments(collection)
    plan = build_script_import_plan(
        collection,
        intents=intents,
        ai_rows=[
            {
                "name": "txnId",
                "kind": "generator",
                "action": "use_builtin",
                "finix_token": "{{$generator.uuid()}}",
                "apply": "auto",
            }
        ],
    )
    assert plan.auto_overrides["txnId"] == "{{$generator.uuid()}}"
    assert plan.auto_overrides["fixed"] == "FROM_SCRIPT"

    prepared = prepare_collection_for_import(
        collection,
        environment,
        extra_var_overrides=plan.auto_overrides,
    )
    rows = parse_collection_requests(prepared.document)
    assert rows[0].body["txnId"] == "{{$generator.uuid()}}"
    assert rows[0].body["fixed"] == "FROM_SCRIPT"
    assert rows[0].body["custId"] == "C001"


def test_ai_context_never_auto_overrides():
    intent = ScriptVarIntent(
        name="actorUnqIdNbr",
        source="pre",
        kind="unknown",
        evidence="randomActorUnqIdNbr",
        apply="needs_review",
        rhs="randomActorUnqIdNbr",
    )
    merged = merge_ai_intent_overrides(
        [intent],
        [
            {
                "name": "actorUnqIdNbr",
                "kind": "extract",
                "action": "extract",
                "finix_token": "{{context.actorUnqIdNbr}}",
                "apply": "auto",
            }
        ],
    )
    assert merged[0].apply == "propose_only"
    assert build_auto_overrides(merged) == {}


def test_const_alias_resolves_for_ai_evidence():
    script = """
const randomActorUnqIdNbr = Array.from({ length: 12 }, () =>
    Math.floor(Math.random() * 10)
).join('');
pm.variables.set('actorUnqIdNbr', randomActorUnqIdNbr);
"""
    bindings = extract_js_bindings(script)
    resolved = resolve_expr("randomActorUnqIdNbr", bindings)
    assert "Array.from" in resolved

    collection = {
        "info": {"name": "col", "schema": "collection"},
        "item": [
            {
                "name": "CU008",
                "event": [
                    {
                        "listen": "prerequest",
                        "script": {"exec": script.split("\n")},
                    }
                ],
                "request": {
                    "method": "POST",
                    "url": "/Customer/CU008",
                    "body": {
                        "mode": "raw",
                        "raw": '{"actorUnqIdNbr":"{{actorUnqIdNbr}}"}',
                    },
                },
            }
        ],
    }
    intents = extract_script_assignments(collection)
    plan = build_script_import_plan(
        collection,
        intents=intents,
        ai_rows=[
            {
                "name": "actorUnqIdNbr",
                "action": "create_catalog",
                "kind": "generator",
                "apply": "auto",
                "create": {
                    "key": "random_digits_12",
                    "label": "난수 12자리",
                    "impl_kind": "random_digits",
                    "impl": {"length": 12},
                    "description": "Returns: 12-digit. Purpose: id. Source: postman_import.",
                },
            }
        ],
    )
    assert plan.auto_overrides["actorUnqIdNbr"] == "{{$generator.random_digits_12()}}"
    assert any(p["key"] == "random_digits_12" for p in plan.catalog_proposals)


def test_template_rewrite_after_ai_maps_parts():
    intents = [
        ScriptVarIntent(
            name="birthDt",
            source="pre",
            kind="generator",
            evidence="birth",
            finix_token="{{$generator.birthdate_yyyymmdd()}}",
            apply="auto",
            catalog_proposal={"key": "birthdate_yyyymmdd"},
        ),
        ScriptVarIntent(
            name="actorFirstName",
            source="pre",
            kind="generator",
            evidence="pick",
            finix_token="{{$generator.english_first_name()}}",
            apply="auto",
        ),
        ScriptVarIntent(
            name="elctrncAddr",
            source="pre",
            kind="unknown",
            evidence="`${birthDt}${actorFirstName}@test.com`",
            apply="needs_review",
            rhs="`${birthDt}${actorFirstName}@test.com`",
        ),
    ]
    plan = build_script_import_plan({}, intents=intents)
    assert plan.auto_overrides["elctrncAddr"] == (
        "{{$generator.birthdate_yyyymmdd()}}"
        "{{$generator.english_first_name()}}"
        "@test.com"
    )


def test_catalog_card_embed_text_includes_returns():
    text = catalog_card_embed_text(
        {
            "key": "random_digits_12",
            "label": "난수 12자리",
            "returns": "12-digit numeric string",
            "impl_kind": "random_digits",
            "description": "Purpose: id",
            "samples": [],
            "impl_summary": {"length": 12},
        }
    )
    assert "random_digits_12" in text
    assert "12-digit" in text


def test_assignment_query_includes_bindings():
    q = assignment_query_text(
        {
            "name": "birthDt",
            "rhs": "`${y}${m}${d}`",
            "related_bindings": {"earliest": "getFullYear() - 80"},
        }
    )
    assert "birthDt" in q
    assert "getFullYear() - 80" in q


def test_clear_rhs_fallback_digits_and_list():
    from app.domain.postman_script_import import (
        ScriptVarIntent,
        apply_clear_rhs_fallbacks,
        build_script_import_plan,
    )

    intents = [
        ScriptVarIntent(
            name="actorUnqIdNbr",
            source="pre",
            kind="unknown",
            evidence="Array.from",
            apply="needs_review",
            rhs=(
                "Array.from({ length: 12 }, () => "
                "Math.floor(Math.random() * 10)).join('')"
            ),
        ),
        ScriptVarIntent(
            name="actorFirstName",
            source="pre",
            kind="unknown",
            evidence="pick",
            apply="needs_review",
            rhs="pickRandom(firstNames)",
            related_bindings={"firstNames": "['Juan', 'Maria', 'Jose']"},
        ),
        ScriptVarIntent(
            name="birthDt",
            source="pre",
            kind="unknown",
            evidence="pad",
            apply="needs_review",
            rhs="`${randomBirthDate.getUTCFullYear()}${pad}`",
            related_bindings={
                "earliest": "new Date().getFullYear() - 80",
                "latest": "new Date().getFullYear() - 18",
            },
        ),
    ]
    plan = build_script_import_plan({}, intents=intents)
    assert plan.auto_overrides["actorUnqIdNbr"] == "{{$generator.random_digits_12()}}"
    assert "actorFirstName" in plan.auto_overrides
    assert plan.auto_overrides["birthDt"] == "{{$generator.birthdate_yyyymmdd()}}"


def test_rag_retrieve_ranks_similar_card():
    import asyncio

    llm = AsyncMock()
    # Distinct directions so cosine prefers the matching card.
    llm.embed_texts = AsyncMock(
        side_effect=[
            # index: uuid card, digits card
            [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
            # query closer to digits
            [[0.1, 0.9, 0.0]],
        ]
    )
    rag = CollectionVarGeneratorRagService(
        embedding_llm=llm,
        embedding_model="test-embed",
        top_k=1,
    )
    cards = [
        {"key": "uuid", "label": "UUID", "returns": "uuid", "description": ""},
        {
            "key": "random_digits_12",
            "label": "난수 12",
            "returns": "12 digits",
            "description": "Array.from length 12",
        },
    ]

    async def _run():
        return await rag.attach_candidates(
            [{"name": "id", "rhs": "Array.from({length:12})", "related_bindings": {}}],
            cards,
            top_k=1,
        )

    rows = asyncio.run(_run())
    assert rows[0]["catalog_candidates"][0]["key"] == "random_digits_12"
    assert "similarity" in rows[0]["catalog_candidates"][0]

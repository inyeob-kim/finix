"""Finix YAML macros → Postman {{var}} + collection pre-request."""

from __future__ import annotations

from app.domain.postman_macro_export import (
    build_finix_macro_prerequest_exec_lines,
    collection_variables_for_macro_specs,
    postman_var_key_for_macro,
    rewrite_mapping_macros_for_postman,
)


def test_var_keys_are_stable():
    assert postman_var_key_for_macro("{{$generator.name()}}") == "gen_name"
    assert postman_var_key_for_macro("{{$date.today()}}") == "date_today"
    assert postman_var_key_for_macro("{{$date.addDays(3)}}") == "date_addDays_3"
    assert postman_var_key_for_macro("{{pool.custId}}") == "pool_custId"


def test_rewrite_mapping_replaces_macros_with_postman_vars():
    body, specs = rewrite_mapping_macros_for_postman(
        {
            "frstNm": "{{$generator.name()}}",
            "pymntDt": "{{$date.today()}}",
            "nested": {"rrn": "{{$generator.ssn()}}"},
            "plain": "ok",
        }
    )
    assert body == {
        "frstNm": "{{gen_name}}",
        "pymntDt": "{{date_today}}",
        "nested": {"rrn": "{{gen_ssn}}"},
        "plain": "ok",
    }
    keys = {s.var_key for s in specs}
    assert keys == {"gen_name", "date_today", "gen_ssn"}


def test_prerequest_sets_collection_variables():
    _, specs = rewrite_mapping_macros_for_postman(
        {"a": "{{$generator.name()}}", "b": "{{$date.today()}}"}
    )
    lines = build_finix_macro_prerequest_exec_lines(specs)
    joined = "\n".join(lines)
    assert "__finixMacroFirst" in joined
    assert 'pm.collectionVariables.set("gen_name"' in joined
    assert 'pm.collectionVariables.set("date_today"' in joined
    assert "__finix_kn_full" in joined  # shared korean name bundle
    assert "김" in joined  # korean_name script source, not a baked runtime value

    vars_ = collection_variables_for_macro_specs(specs)
    assert {row["key"] for row in vars_} == {"gen_name", "date_today"}
    assert all(row["value"] == "" for row in vars_)


def test_name_parts_share_one_postman_bundle():
    assert postman_var_key_for_macro("{{$generator.name.family()}}") == "gen_name_family"
    body, specs = rewrite_mapping_macros_for_postman(
        {
            "full": "{{$generator.name()}}",
            "family": "{{$generator.name.family()}}",
            "given": "{{$generator.name.given()}}",
        }
    )
    assert body["full"] == "{{gen_name}}"
    assert body["family"] == "{{gen_name_family}}"
    assert body["given"] == "{{gen_name_given}}"
    joined = "\n".join(build_finix_macro_prerequest_exec_lines(specs))
    assert joined.count("__finix_kn_full") >= 1
    assert 'pm.collectionVariables.set("gen_name_family"' in joined
    assert 'pm.collectionVariables.set("gen_name_given"' in joined

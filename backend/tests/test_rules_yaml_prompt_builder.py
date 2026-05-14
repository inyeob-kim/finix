from app.prompts.service_rules_yaml_prompt import (
    ServiceMetaForRules,
    build_system_prompt,
    build_user_prompt,
)


def test_system_prompt_contains_hard_requirements():
    s = build_system_prompt()
    assert "YAML only" in s
    assert "rule_type" in s
    assert "error, business, code" in s


def test_user_prompt_includes_service_meta_and_template():
    meta = ServiceMetaForRules(
        service_code="PY016",
        service_name="x",
        http_method="POST",
        uri="/y",
        in_dto="InDto",
        out_dto="OutDto",
    )
    u = build_user_prompt(service=meta, objective="make it strict", existing_active_yaml=None)
    assert '"service_code": "PY016"' in u
    assert "Generate YAML following this example structure" in u


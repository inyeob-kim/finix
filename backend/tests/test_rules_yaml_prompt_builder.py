from app.prompts.service_rules_from_source_prompt import (
    BUSINESS_ORIENTED_EXTRACTION_GLOBAL,
    SOURCE_ANALYSIS_CHECKLIST,
    build_repair_user_prompt,
    build_system_prompt_from_source,
    build_user_prompt_from_source,
    build_yaml_ai_cached_system_prompt_from_source,
)
from app.prompts.service_rules_yaml_prompt import (
    ServiceMetaForRules,
    YAML_TEMPLATE_EXAMPLE,
    build_system_prompt,
    build_user_prompt,
    build_yaml_ai_cached_system_prompt,
)


def test_system_prompt_contains_hard_requirements():
    s = build_system_prompt()
    assert "YAML only" in s
    assert "case_id" in s
    assert "rule_type values must be E and N only" in s
    assert "input" in s
    assert "$.error_code" in s
    assert "validation_target" in s
    assert "rule_id" not in s or "instead of rule_id" in s
    assert "Generalization Rules for All Services" in s
    assert "http_status" in s


def test_system_prompt_from_source_requires_source_evidence():
    s = build_system_prompt_from_source()
    assert "source_evidence" in s
    assert "Do NOT invent cases" in s
    assert "BUSINESS-ORIENTED EXTRACTION" in s
    assert "Use case_id instead of rule_id" in s
    assert "Use input instead of minimal_input" in s
    assert "Do NOT include severity" in s
    assert "rule_type values must be E and N only" in s
    assert "validation_target" in s
    assert "Additional guidance for assertions" in s
    assert "Generalization Rules for All Services" in s
    assert "Non-Observable Effects" in s
    assert "directly executable" in s
    assert "Enum.getValue()" in s
    assert "BUSINESS-ORIENTED CASE EXTRACTION RULES" in s
    assert "in.getXXX()" in s
    assert "Returning null or skipping optional processing is NOT an error" in s
    assert "Consolidate overly granular" in s or "getBean" in s


def test_cached_system_prompt_includes_template_for_objective_flow():
    cached = build_yaml_ai_cached_system_prompt()
    assert "Generalization Rules for All Services" in cached
    assert YAML_TEMPLATE_EXAMPLE.strip() in cached
    assert "PY016-E-001" in cached


def test_cached_system_prompt_from_source_includes_checklist_and_template():
    cached = build_yaml_ai_cached_system_prompt_from_source()
    assert SOURCE_ANALYSIS_CHECKLIST.splitlines()[0] in cached
    assert YAML_TEMPLATE_EXAMPLE.strip() in cached
    assert "BUSINESS-ORIENTED CASE EXTRACTION RULES" in cached
    assert BUSINESS_ORIENTED_EXTRACTION_GLOBAL.splitlines()[0] in cached


def test_user_prompt_is_dynamic_only():
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
    assert "structural example from the system prompt" in u
    assert "PY016-E-001" not in u


def test_user_prompt_from_source_excludes_cached_blocks():
    meta = ServiceMetaForRules(
        service_code="PY016",
        service_name="x",
        http_method="POST",
        uri="/y",
        in_dto="InDto",
        out_dto="OutDto",
    )
    u = build_user_prompt_from_source(
        service=meta,
        source_code="public void execute() {}",
        hints=None,
    )
    assert SOURCE_ANALYSIS_CHECKLIST.splitlines()[0] not in u
    assert "Pasted source code:" in u
    assert "PY016-E-001" not in u


def test_repair_user_prompt_contains_error_and_yaml():
    p = build_repair_user_prompt(
        validation_error="rules[0].severity",
        invalid_yaml="service_code: X",
    )
    assert "rules[0].severity" in p
    assert "service_code: X" in p
    assert "Return YAML only" in p
    assert "assertions" in p


def test_template_includes_en_case_schema():
    assert "regList:" in YAML_TEMPLATE_EXAMPLE
    assert "trgtAcctNbr" in YAML_TEMPLATE_EXAMPLE
    assert "BAPPYE0008" in YAML_TEMPLATE_EXAMPLE
    assert "not_null" in YAML_TEMPLATE_EXAMPLE
    assert "case_id" in YAML_TEMPLATE_EXAMPLE
    assert "validation_target" in YAML_TEMPLATE_EXAMPLE
    assert "rule_type: \"E\"" in YAML_TEMPLATE_EXAMPLE
    assert "rule_type: \"N\"" in YAML_TEMPLATE_EXAMPLE

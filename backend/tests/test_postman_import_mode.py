"""Postman import mode selection (draft-only must merge, not create)."""

from app.services.postman_rules_import_service import resolve_postman_import_mode


def test_resolve_mode_merge_when_draft_base_exists():
    assert resolve_postman_import_mode([{"case_id": "SVC-N-001"}]) == "merge"


def test_resolve_mode_create_when_no_base():
    assert resolve_postman_import_mode([]) == "create"
    assert resolve_postman_import_mode(None) == "create"

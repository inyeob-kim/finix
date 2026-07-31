"""Build Postman Collection v2.1 ``variable`` entries from scenario config."""

from __future__ import annotations

from app.domain.collection_var_generators import resolve_start_var_value
from app.domain.postman_bxm_system_header import collection_start_vars
from app.domain.postman_collection_config import PostmanCollectionConfig

BASE_URL_KEY = "baseUrl"


def build_postman_collection_variables(
    config: PostmanCollectionConfig | None,
    *,
    runtime_var_names: list[str],
) -> list[dict[str, str]]:
    """
    Merge baseUrl, collection start vars, and extract-driven runtime vars.

    Header (BXM) values are baked into the collection pre-request script, not
    listed here — so collection vars may reuse the same names (e.g. txDt).
    Generators are resolved once at export time (snapshot for Postman import).
    """
    ordered: list[tuple[str, str]] = []
    seen: set[str] = set()

    def add(key: str, value: str) -> None:
        k = key.strip()
        if not k or k in seen:
            return
        seen.add(k)
        ordered.append((k, value))

    cfg = config or PostmanCollectionConfig()
    add(BASE_URL_KEY, cfg.base_url.strip())
    for row in collection_start_vars(cfg):
        add(
            row.key,
            resolve_start_var_value(value=row.value, generator=row.generator),
        )
    for name in runtime_var_names:
        add(name, "")

    return [
        {"key": key, "value": value, "type": "string"}
        for key, value in ordered
    ]


def collect_runtime_var_names_from_bindings(
    binding_map: dict[int, tuple[list, list, list]],
) -> list[str]:
    """Unique extract variable names in step order."""
    out: list[str] = []
    seen: set[str] = set()
    for step_idx in sorted(binding_map):
        _inj, extracts, _ov = binding_map.get(step_idx, ([], [], []))
        for spec in extracts:
            var = spec.var.strip()
            if var and var not in seen:
                seen.add(var)
                out.append(var)
    return out

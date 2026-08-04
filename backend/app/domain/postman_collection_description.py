"""Build Postman collection ``info.description`` (scenario flow summary)."""

from __future__ import annotations

from typing import Any

from app.domain.postman_bxm_system_header import collection_start_vars
from app.domain.postman_collection_config import PostmanCollectionConfig
from app.models.testcase import TestCase


def _step_title(
    *,
    display_index: int,
    service_code: str | None,
    testcase: TestCase,
) -> str:
    code = (service_code or "").strip()
    name = (testcase.name or "").strip() or f"Step {display_index}"
    method = (testcase.http_method or "POST").strip().upper()
    endpoint = (testcase.endpoint or "").strip() or "/"
    head = f"{display_index}. **{code}** — {name}" if code else f"{display_index}. {name}"
    return f"{head}  \n   `{method} {endpoint}`"


def _binding_lines(
    injects: list[Any],
    extracts: list[Any],
    overrides: list[Any],
) -> list[str]:
    lines: list[str] = []
    for spec in extracts:
        var = getattr(spec, "var", "") or ""
        path = getattr(spec, "json_path", "") or ""
        if var and path:
            lines.append(f"   - extract `{var}` ← `{path}`")
    for spec in injects:
        var = getattr(spec, "var", "") or ""
        path = getattr(spec, "json_path", "") or ""
        if var and path:
            lines.append(f"   - inject `{path}` ← `{{{{{var}}}}}`")
    for spec in overrides:
        path = getattr(spec, "json_path", "") or ""
        value = getattr(spec, "value", None)
        if path:
            lines.append(f"   - override `{path}` = `{value}`")
    return lines


def _start_var_lines(config: PostmanCollectionConfig | None) -> list[str]:
    rows = collection_start_vars(config)
    if not rows:
        return []
    out: list[str] = ["## 시작 변수", ""]
    for row in rows:
        key = row.key.strip()
        if not key:
            continue
        gen = (row.generator or "").strip()
        if gen:
            out.append(f"- `{key}` ← generator `{gen}`")
        else:
            preview = (row.value or "").strip()
            if len(preview) > 48:
                preview = preview[:45] + "…"
            out.append(f"- `{key}` = `{preview}`" if preview else f"- `{key}`")
    out.append("")
    return out


def build_postman_collection_description(
    *,
    title: str,
    prompt: str | None,
    testcases: list[TestCase],
    binding_map: dict[int, tuple[list, list, list]],
    step_service_codes: dict[int, str],
    postman_config: PostmanCollectionConfig | None,
    native: bool,
) -> str:
    """
    Markdown shown in Postman's collection description panel.

    Includes scenario prompt, ordered step flow, binding summary, and usage notes.
    """
    lines: list[str] = [
        f"# {title.strip() or 'Scenario'}",
        "",
    ]
    prompt_text = (prompt or "").strip()
    if prompt_text:
        lines.extend([prompt_text, ""])

    lines.extend(["## 시나리오 흐름", ""])
    if not testcases:
        lines.append("_연결된 테스트 케이스가 없습니다._")
        lines.append("")
    else:
        for enum_idx, tc in enumerate(testcases):
            logical = tc.step_index if tc.step_index is not None else enum_idx
            display = enum_idx + 1
            svc = step_service_codes.get(logical)
            lines.append(
                _step_title(
                    display_index=display,
                    service_code=svc,
                    testcase=tc,
                ),
            )
            injects, extracts, overrides = binding_map.get(
                logical,
                ([], [], []),
            )
            lines.extend(_binding_lines(injects, extracts, overrides))
            lines.append("")

    lines.extend(_start_var_lines(postman_config))

    lines.extend(
        [
            "## 사용 방법",
            "",
            "- Collection Runner로 **요청 순서대로** 실행하세요.",
        ],
    )
    if native:
        lines.extend(
            [
                "- 스텝 간 값은 `{{변수}}` inject / Test 스크립트 extract로 연결됩니다.",
                "- 생성기 시작 변수는 Runner 실행의 **첫 요청**에서 다시 시드됩니다.",
            ],
        )
    else:
        lines.append("- 본문은 export 시점 스냅샷입니다.")
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"

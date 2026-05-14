"""Deterministic scenario step construction (no LLM)."""

from __future__ import annotations

import uuid
from typing import Any, Literal


def _new_id() -> str:
    """Return a short stable-enough client id for UI lists."""
    return str(uuid.uuid4())[:12]


def _step(
    number: int,
    action: str,
    result: Literal["success", "error"],
    reason: str,
) -> dict[str, Any]:
    """Build one step dict aligned with the frontend shape."""
    return {
        "id": _new_id(),
        "number": number,
        "action": action,
        "result": result,
        "reason": reason,
    }


def build_steps_from_prompt(prompt: str) -> list[dict[str, Any]]:
    """
    Produce default banking-flow steps from a natural language prompt.

    This is intentionally template-based (ai-integration: deterministic path).
    """
    text = prompt.strip()
    low = text.lower()
    withdraw_error = ("출금" in text or "withdraw" in low) and (
        "에러" in text
        or "실패" in text
        or "error" in low
        or "잔액" in text
        or "부족" in text
    )
    steps = [
        _step(1, "고객 생성", "success", "새 고객 계정 생성"),
        _step(2, "정기예금 생성", "success", "계좌에 자금 추가"),
    ]
    if withdraw_error:
        steps.append(_step(3, "출금", "error", "잔액 부족"))
    else:
        steps.append(_step(3, "출금", "success", "정상 출금"))
    return steps


def refine_steps_with_instruction(
    steps: list[dict[str, Any]],
    instruction: str,
) -> list[dict[str, Any]]:
    """Append a synthetic refinement step derived from user instruction."""
    trimmed = instruction.strip()[:500]
    out = list(steps)
    out.append(
        _step(
            len(out) + 1,
            f"(AI 수정) {trimmed}",
            "success",
            "사용자 지시에 따른 추가 단계",
        ),
    )
    for i, row in enumerate(out, start=1):
        row["number"] = i
    return out

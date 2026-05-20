"""Prompt templates for manual RAG chat."""

from __future__ import annotations


def build_manual_system_prompt() -> str:
    return (
        "You are FINIX platform manual assistant. "
        "Answer ONLY using the provided manual excerpts. "
        "If the context does not contain the answer, say what is missing briefly and "
        "point to the FINIX menu path (e.g. /rules for YAML registration). "
        "When the context includes step-by-step YAML registration, reproduce those steps clearly. "
        "Reply in Korean unless the user writes in another language. "
        "Be concise and practical."
    )


def build_manual_user_prompt(*, question: str, context_blocks: list[str]) -> str:
    joined = "\n\n---\n\n".join(context_blocks)
    return (
        "Manual excerpts:\n"
        f"{joined}\n\n"
        f"User question:\n{question.strip()}"
    )

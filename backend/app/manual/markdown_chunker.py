"""Split markdown manuals into header-scoped chunks for RAG."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ManualChunkDoc:
    """One section of the manual."""

    header_path: str
    content: str
    chunk_index: int


_HEADER_RE = re.compile(r"^(#{1,3})\s+(.+)$")


def chunk_markdown_by_headers(text: str) -> list[ManualChunkDoc]:
    """
    Chunk markdown at ``#``, ``##``, and ``###`` boundaries.

    Each chunk keeps its heading lines plus body until the next heading.
    """
    lines = (text or "").splitlines()
    chunks: list[ManualChunkDoc] = []
    section_lines: list[str] = []
    header_stack: list[tuple[int, str]] = []

    def header_path() -> str:
        if not header_stack:
            return "Introduction"
        return " > ".join(title for _, title in header_stack)

    def flush() -> None:
        body = "\n".join(section_lines).strip()
        if not body:
            return
        chunks.append(
            ManualChunkDoc(
                header_path=header_path(),
                content=body,
                chunk_index=len(chunks),
            )
        )

    for line in lines:
        match = _HEADER_RE.match(line)
        if match:
            flush()
            level = len(match.group(1))
            title = match.group(2).strip()
            while header_stack and header_stack[-1][0] >= level:
                header_stack.pop()
            header_stack.append((level, title))
            section_lines = [line]
        else:
            section_lines.append(line)

    flush()
    return chunks

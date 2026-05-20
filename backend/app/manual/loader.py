"""Load FINIX manual markdown corpus from one or more files."""

from __future__ import annotations

import hashlib
from pathlib import Path

from app.manual.markdown_chunker import ManualChunkDoc, chunk_markdown_by_headers


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def collect_manual_paths(*, main_path: str, docs_dir: str | None) -> list[Path]:
    """Return sorted unique markdown paths for indexing."""
    paths: list[Path] = []
    main = Path(main_path)
    if main.is_file():
        paths.append(main.resolve())
    if docs_dir:
        root = Path(docs_dir)
        if root.is_dir():
            for p in sorted(root.rglob("*.md")):
                resolved = p.resolve()
                if resolved not in paths:
                    paths.append(resolved)
    return paths


def load_manual_chunks(*, main_path: str, docs_dir: str | None) -> tuple[list[ManualChunkDoc], str, str]:
    """
    Load all manual markdown files and chunk by headers.

    Returns:
        (chunks, combined_checksum, source_path_summary)
    """
    paths = collect_manual_paths(main_path=main_path, docs_dir=docs_dir)
    if not paths:
        raise FileNotFoundError(f"No manual markdown found: {main_path}")

    combined_parts: list[str] = []
    all_chunks: list[ManualChunkDoc] = []
    global_index = 0

    for path in paths:
        text = path.read_text(encoding="utf-8")
        combined_parts.append(f"<!-- {path.as_posix()} -->\n{text}")
        file_label = path.stem
        for doc in chunk_markdown_by_headers(text):
            all_chunks.append(
                ManualChunkDoc(
                    header_path=f"{file_label} > {doc.header_path}",
                    content=doc.content,
                    chunk_index=global_index,
                )
            )
            global_index += 1

    combined = "\n\n".join(combined_parts)
    summary = "; ".join(p.name for p in paths[:5])
    if len(paths) > 5:
        summary += f" (+{len(paths) - 5} more)"
    return all_chunks, _sha256_text(combined), summary

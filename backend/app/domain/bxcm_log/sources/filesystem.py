"""Filesystem bulk log source (Phase 3 connector skeleton)."""

from __future__ import annotations

from pathlib import Path


SUPPORTED_SUFFIXES = {".log", ".txt", ".json", ".jsonl"}


def read_bulk_log_directory(directory: str | Path, *, max_files: int = 50) -> str:
    """
    Concatenate log files under *directory* for parse/commit.

    Newest files first (by mtime). Raises FileNotFoundError if missing.
    """
    root = Path(directory)
    if not root.is_dir():
        raise FileNotFoundError(f"Bulk log directory not found: {root}")
    files = [
        p
        for p in root.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED_SUFFIXES
    ]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    chunks: list[str] = []
    for path in files[:max_files]:
        try:
            text = path.read_text(encoding="utf-8", errors="replace").strip()
        except OSError:
            continue
        if text:
            chunks.append(f"# file: {path.name}\n{text}")
    return "\n\n".join(chunks)

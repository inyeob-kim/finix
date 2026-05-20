"""Tests for multi-file manual loader."""

from pathlib import Path

from app.manual.loader import load_manual_chunks


def test_load_manual_chunks_includes_chapters():
    root = Path(__file__).resolve().parents[2]
    main = root / "docs" / "FINIX_MANUAL.md"
    chapters = root / "docs" / "manual"
    chunks, checksum, summary = load_manual_chunks(
        main_path=str(main),
        docs_dir=str(chapters),
    )
    assert checksum
    assert "01-getting-started" in summary or len(chunks) > 5
    paths = {c.header_path for c in chunks}
    assert any("01-getting-started" in p for p in paths)

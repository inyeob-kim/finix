"""Tests for markdown header chunking."""

from app.manual.markdown_chunker import chunk_markdown_by_headers


def test_chunk_by_headers():
    md = """# Title

Intro paragraph.

## Section A

Body A.

### Sub A1

Detail.

## Section B

Body B.
"""
    chunks = chunk_markdown_by_headers(md)
    assert len(chunks) >= 3
    paths = [c.header_path for c in chunks]
    assert any("Section A" in p for p in paths)
    assert any("Sub A1" in p or "Section A" in p for p in paths)

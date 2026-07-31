"""Filesystem bulk source unit tests."""

from pathlib import Path

from app.domain.bxcm_log.sources.filesystem import read_bulk_log_directory


def test_read_bulk_log_directory(tmp_path: Path):
    (tmp_path / "a.json").write_text(
        '{"exchanges":[{"method":"POST","endpoint":"/a","http_status":200}]}',
        encoding="utf-8",
    )
    (tmp_path / "b.txt").write_text("POST /b\nstatus: 500\n", encoding="utf-8")
    text = read_bulk_log_directory(tmp_path)
    assert "file: a.json" in text or "file: b.txt" in text
    assert "/a" in text or "POST /b" in text

import hashlib
from pathlib import Path

from app.services.service_catalog_service import _file_sha256


def test_file_sha256_matches_hashlib(tmp_path: Path):
    p = tmp_path / "x.txt"
    p.write_bytes(b"abc")
    assert _file_sha256(p) == hashlib.sha256(b"abc").hexdigest()


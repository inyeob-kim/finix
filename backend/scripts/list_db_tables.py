"""Print SQLite table names for the app database."""

import sqlite3
from pathlib import Path

db = Path(__file__).resolve().parents[1] / "finix_db.db"
conn = sqlite3.connect(db)
rows = conn.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
).fetchall()
print("DB:", db)
for (name,) in rows:
    print(" -", name)

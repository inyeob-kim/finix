from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src" / "app" / "components" / "RulesMeta.tsx"
text = p.read_text(encoding="utf-8")

if "registryError ?" in text:
    print("already patched")
    raise SystemExit(0)

needle = (
    "        </div>\n\n"
    '        <div className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">'
)
banner = (
    "        {registryError ? (\n"
    '          <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-4 py-3">\n'
    "            {registryError}\n"
    "          </div>\n"
    "        ) : null}\n\n"
)
insert = "        </div>\n\n" + banner + (
    '        <div className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">'
)

if needle not in text:
    raise SystemExit("needle not found")

p.write_text(text.replace(needle, insert, 1), encoding="utf-8")
print("inserted banner")

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/app/components/TestCaseManage.tsx",
);

let s = fs.readFileSync(target, "utf8");
if (s.includes("TestCaseIoPreview")) {
  console.log("Already patched");
  process.exit(0);
}

s = s.replace(
  `  Sparkles,
} from "lucide-react";`,
  `  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";`,
);

s = s.replace(
  `import { FinixPrimaryButton } from "./ui/finix-button";`,
  `import { FinixPrimaryButton } from "./ui/finix-button";
import { TestCaseIoPreview } from "./TestCaseIoPreview";`,
);

s = s.replace(
  `  const [replaceExisting, setReplaceExisting] = useState(true);`,
  `  const [replaceExisting, setReplaceExisting] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);`,
);

s = s.replace(
  `              <TableRow>
                <TableHead className="w-[72px]">ID</TableHead>`,
  `              <TableRow>
                <TableHead className="w-10" aria-label="상세" />
                <TableHead className="w-[72px]">ID</TableHead>`,
);

s = s.replaceAll(`colSpan={6}`, `colSpan={7}`);

const oldRowBlock = `                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell className="max-w-[320px]">
                      <span className="line-clamp-2 text-sm">{r.name}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.scenario_id != null ? \`#\${r.scenario_id}\` : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.method ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[240px] truncate">
                      {r.endpoint ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.scenario_id != null ? (
                        <Link
                          to={\`/test-case/\${r.scenario_id}\`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          title="해당 시나리오의 테스트 케이스 화면으로 이동"
                        >
                          열기
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))`;

const newRowBlock = `                rows.map((r) => {
                  const open = expandedId === r.id;
                  return (
                    <>
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() =>
                          setExpandedId((prev) => (prev === r.id ? null : r.id))
                        }
                      >
                        <TableCell className="w-10 p-2">
                          {open ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.id}</TableCell>
                        <TableCell className="max-w-[320px]">
                          <span className="line-clamp-2 text-sm">{r.name}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.scenario_id != null ? \`#\${r.scenario_id}\` : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.method ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[240px] truncate">
                          {r.endpoint ?? "—"}
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.scenario_id != null ? (
                            <Link
                              to={\`/test-case/\${r.scenario_id}\`}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              title="해당 시나리오의 테스트 케이스 화면으로 이동"
                            >
                              열기
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow key={\`\${r.id}-detail\`}>
                          <TableCell colSpan={7} className="p-0">
                            <TestCaseIoPreview test={r} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </>
                  );
                })`;

if (!s.includes(oldRowBlock.slice(0, 80))) {
  console.error("Row block not found — file may differ");
  process.exit(1);
}
s = s.replace(oldRowBlock, newRowBlock);

s = s.replace(
  `  useEffect(() => {
    if (!serviceCode.trim() || catalogLoading) return;
    void loadTestCases();
  }, [serviceCode, catalogLoading, loadTestCases]);`,
  `  useEffect(() => {
    if (!serviceCode.trim() || catalogLoading) return;
    setExpandedId(null);
    void loadTestCases();
  }, [serviceCode, catalogLoading, loadTestCases]);`,
);

fs.writeFileSync(target, s, "utf8");
console.log("Patched IO expand", target);

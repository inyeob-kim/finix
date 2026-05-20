import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, "../src/app/components/TestCaseManage.tsx");

let s = execSync("git show HEAD:frontend/src/app/components/TestCaseManage.tsx", {
  encoding: "utf8",
  cwd: path.join(__dirname, "../.."),
});

s = s.replace(
  `import { ExternalLink, ListChecks, Loader2, RefreshCw } from "lucide-react";
import { listTestCasesByServiceCode } from "@/api/testcaseApi";
import { listServiceCatalog } from "@/api/serviceCatalogApi";
import { ApiError } from "@/api/client";
import type { TestCaseReadDto } from "@/api/types";
import { PageShell } from "./PageShell";`,
  `import {
  ExternalLink,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  listTestCasesByServiceCode,
  materializeTestCasesForService,
} from "@/api/testcaseApi";
import { ApiError } from "@/api/client";
import type { TestCaseReadDto } from "@/api/types";
import { useServiceCatalogPicker } from "@/hooks/useServiceCatalogPicker";
import { PageShell } from "./PageShell";`,
);

s = s.replace(
  `import { FinixField, FinixUnderlineSelect } from "./ui/finix-form";
import { FinixPrimaryButton } from "./ui/finix-button";
import { SERVICE_CATALOG } from "./scenarioRegistry/constants";

export function TestCaseManage() {
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [services, setServices] = useState<
    { code: string; name: string }[]
  >([]);
  const [serviceCode, setServiceCode] = useState("");
  const [rows, setRows] = useState<TestCaseReadDto[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCatalogLoading(true);
      setError(null);
      try {
        const apiRows = await listServiceCatalog();
        if (cancelled) return;
        const mapped = apiRows
          .map((r) => ({
            code: (r.service_code || "").trim(),
            name: (r.service_name || "").trim() || r.service_code,
          }))
          .filter((r) => r.code);
        const catalog =
          mapped.length > 0
            ? mapped
            : SERVICE_CATALOG.map((s) => ({ code: s.code, name: s.name }));
        catalog.sort((a, b) => a.code.localeCompare(b.code));
        if (cancelled) return;
        setServices(catalog);
        setServiceCode((prev) =>
          prev && catalog.some((s) => s.code === prev)
            ? prev
            : catalog[0]?.code ?? "",
        );
      } catch (e) {
        if (!cancelled) {
          setServices(SERVICE_CATALOG);
          setServiceCode((prev) => prev || SERVICE_CATALOG[0]?.code || "");
          if (e instanceof ApiError && e.status !== 401) {
            setError("서비스 카탈로그를 불러오지 못해 로컬 목록을 사용합니다.");
          }
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadTestCases = useCallback(async () => {`,
  `import { FinixField, FinixUnderlineTextarea } from "./ui/finix-form";
import { ServiceCatalogCombobox } from "./ServiceCatalogCombobox";
import { FinixPrimaryButton } from "./ui/finix-button";

const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-2 h-9 px-3 rounded-sm border border-border bg-background text-sm font-medium hover:bg-muted hover:border-primary/30 transition-colors disabled:opacity-50 disabled:pointer-events-none";

export function TestCaseManage() {
  const {
    options: services,
    loading: catalogLoading,
    error: catalogError,
  } = useServiceCatalogPicker();
  const [serviceCode, setServiceCode] = useState("");
  const [rows, setRows] = useState<TestCaseReadDto[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateNotice, setGenerateNotice] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(true);

  const loadTestCases = useCallback(async () => {`,
);

s = s.replace(
  `    setError(null);
    try {
      const data = await listTestCasesByServiceCode(code, 500);
      setRows(data);
    } catch (e) {
      setRows([]);
      setError(
        e instanceof ApiError ? e.message : "테스트 케이스를 불러오지 못했습니다.",
      );`,
  `    setListError(null);
    try {
      const data = await listTestCasesByServiceCode(code, 500);
      setRows(data);
    } catch (e) {
      setRows([]);
      setListError(
        e instanceof ApiError ? e.message : "테스트 케이스를 불러오지 못했습니다.",
      );`,
);

s = s.replace(
  `  useEffect(() => {
    if (!serviceCode || catalogLoading) return;
    void loadTestCases();
  }, [serviceCode, catalogLoading, loadTestCases]);

  const serviceLabel = useMemo(() => {
    const s = services.find((x) => x.code === serviceCode);
    return s ? \`\${s.code} — \${s.name}\` : serviceCode;
  }, [services, serviceCode]);

  return (`,
  `  useEffect(() => {
    if (!serviceCode.trim() || catalogLoading) return;
    void loadTestCases();
  }, [serviceCode, catalogLoading, loadTestCases]);

  const serviceLabel = useMemo(() => {
    const s = services.find((x) => x.code === serviceCode);
    return s ? \`\${s.code} — \${s.name}\` : serviceCode || "—";
  }, [services, serviceCode]);

  const bannerError = catalogError ?? listError;

  const handleGenerate = async () => {
    const code = serviceCode.trim();
    if (!code) return;
    setGenerateLoading(true);
    setListError(null);
    setGenerateNotice(null);
    try {
      const created = await materializeTestCasesForService(code, {
        instruction: instruction.trim() || null,
        replace_existing: replaceExisting,
      });
      setGenerateNotice(\`\${created.length}건의 테스트 케이스를 생성했습니다.\`);
      await loadTestCases();
    } catch (e) {
      setListError(
        e instanceof ApiError
          ? e.message
          : "테스트 케이스를 생성하지 못했습니다.",
      );
    } finally {
      setGenerateLoading(false);
    }
  };

  return (`,
);

s = s.replace(
  `          모아 봅니다.
        </>
      }
      actions={
        <FinixPrimaryButton
          type="button"
          className="gap-2"
          disabled={listLoading || !serviceCode}
          onClick={() => void loadTestCases()}
        >
          <RefreshCw
            className={\`w-4 h-4 \${listLoading ? "animate-spin" : ""}\`}
          />
          새로고침
        </FinixPrimaryButton>
      }
    >
      {error ? (`,
  `          모아 봅니다. 서비스·생성 옵션을 선택한 뒤 아래에서 생성·조회합니다.
        </>
      }
    >
      {bannerError ? (`,
);

s = s.replace(
  `        <FinixField label="서비스" helperText="SRVC_CD 기준으로 적재된 테스트 케이스를 조회합니다.">
          {catalogLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              서비스 목록 불러오는 중…
            </div>
          ) : (
            <FinixUnderlineSelect
              value={serviceCode}
              onChange={(e) => setServiceCode(e.target.value)}
            >
              {services.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </option>
              ))}
            </FinixUnderlineSelect>
          )}
        </FinixField>

        <div className="text-xs text-muted-foreground">
          선택: {serviceLabel} · {rows.length}건
        </div>

        <div className="rounded-sm border border-border overflow-hidden">`,
  `        <FinixField
          label="서비스"
          helperText="코드 또는 이름으로 검색 후 선택 (검색 결과 최대 50건)"
        >
          <ServiceCatalogCombobox
            options={services}
            value={serviceCode}
            onValueChange={setServiceCode}
            loading={catalogLoading}
            disabled={services.length === 0 || catalogLoading}
          />
        </FinixField>

        <FinixField
          label="생성 메모 (선택)"
          helperText="테스트 케이스 이름 뒤에 붙는 짧은 설명"
        >
          <FinixUnderlineTextarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            className="min-h-[2.5rem]"
            disabled={generateLoading}
            placeholder="예: regression-2026-05"
          />
        </FinixField>

        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={(e) => setReplaceExisting(e.target.checked)}
            disabled={generateLoading}
            className="rounded border-border"
          />
          기존 서비스 풀 테스트케이스를 삭제한 뒤 다시 생성
        </label>

        {generateNotice ? (
          <div className="rounded-sm border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 text-sm px-3 py-2">
            {generateNotice}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <FinixPrimaryButton
            type="button"
            className="h-9 px-4 w-auto gap-2 shrink-0"
            disabled={
              generateLoading || catalogLoading || !serviceCode.trim()
            }
            onClick={() => void handleGenerate()}
          >
            {generateLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            YAML에서 생성
          </FinixPrimaryButton>
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={listLoading || !serviceCode.trim()}
            onClick={() => void loadTestCases()}
          >
            <RefreshCw
              className={\`w-4 h-4 \${listLoading ? "animate-spin" : ""}\`}
            />
            목록 새로고침
          </button>
          <span className="text-xs text-muted-foreground ml-auto min-w-0 truncate">
            {serviceCode.trim()
              ? \`\${serviceLabel} · \${rows.length}건\`
              : "서비스 미선택"}
          </span>
        </div>

        <div className="rounded-sm border border-border overflow-hidden">`,
);

// Fix accidental motion.div from template - use div only
s = s.replace(/<motion\.div/g, "<motion.div").replace(/<\/motion\.motion\.motion\.div>/g, "</motion.div>");
s = s.replace(/motion\.div/g, "div");

s = s.replace(
  `            <TableBody>
              {listLoading ? (`,
  `            <TableBody>
              {!serviceCode.trim() ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-10"
                  >
                    위에서 서비스를 검색·선택하세요.
                  </TableCell>
                </TableRow>
              ) : listLoading ? (`,
);

s = s.replace(
  `                    이 서비스에 적재된 테스트 케이스가 없습니다.`,
  `                    이 서비스에 적재된 테스트 케이스가 없습니다. 활성 YAML 규칙이
                    있으면 「YAML에서 생성」을 눌러 주세요.`,
);

s = s.replace(
  /(\{bannerError \? \([\s\S]*?<div className="rounded-sm border border-destructive[^>]*>\s*)\{error\}/,
  "$1{bannerError}",
);

fs.writeFileSync(target, s, "utf8");
console.log("Restored", target);

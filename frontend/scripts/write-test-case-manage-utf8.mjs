import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/app/components/TestCaseManage.tsx",
);

const content = `import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ExternalLink,
  ListChecks,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  listTestCasesByServiceCode,
  materializeTestCasesForService,
} from "@/api/testcaseApi";
import { ApiError } from "@/api/client";
import type { TestCaseReadDto } from "@/api/types";
import { useServiceCatalogPicker } from "@/hooks/useServiceCatalogPicker";
import { PageShell } from "./PageShell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { FinixField, FinixUnderlineTextarea } from "./ui/finix-form";
import { ServiceCatalogCombobox } from "./ServiceCatalogCombobox";
import { FinixPrimaryButton } from "./ui/finix-button";
import { FinixLoading } from "./ui/finix-loading";
import { TestCaseIoPreview } from "./TestCaseIoPreview";

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
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadTestCases = useCallback(async () => {
    const code = serviceCode.trim();
    if (!code) {
      setRows([]);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const data = await listTestCasesByServiceCode(code, 500);
      setRows(data);
    } catch (e) {
      setRows([]);
      setListError(
        e instanceof ApiError ? e.message : "테스트 케이스를 불러오지 못했습니다.",
      );
    } finally {
      setListLoading(false);
    }
  }, [serviceCode]);

  useEffect(() => {
    if (!serviceCode.trim() || catalogLoading) return;
    setExpandedId(null);
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

  return (
    <PageShell
      icon={<ListChecks className="w-5 h-5" strokeWidth={2} />}
      title="테스트케이스 관리"
      description={
        <>
          YAML 규칙에서 생성되어 DB에 적재된 HTTP 테스트케이스를{" "}
          <span className="font-medium text-foreground">서비스 코드</span>별로
          모아 봅니다. 서비스·생성 옵션을 선택한 뒤 아래에서 생성·조회합니다.
        </>
      }
    >
      {bannerError ? (
        <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-4 py-3">
          {bannerError}
        </div>
      ) : null}

      <div className="rounded-sm border border-border bg-card p-4 md:p-5 space-y-4">
        <FinixField
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
          helperText="테스트케이스 이름 뒤에 붙는 짧은 설명"
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
              <FinixLoading size="sm" inline />
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
            {listLoading ? (
              <FinixLoading size="sm" inline />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            목록 새로고침
          </button>
          <span className="text-xs text-muted-foreground ml-auto min-w-0 truncate">
            {serviceCode.trim()
              ? \`\${serviceLabel} · \${rows.length}건\`
              : "서비스 미선택"}
          </span>
        </div>

        <div className="rounded-sm border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" aria-label="상세" />
                <TableHead className="w-[72px]">ID</TableHead>
                <TableHead>이름</TableHead>
                <TableHead className="w-[100px]">시나리오</TableHead>
                <TableHead className="w-[88px]">메서드</TableHead>
                <TableHead>엔드포인트</TableHead>
                <TableHead className="w-[100px] text-right">이동</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!serviceCode.trim() ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-10"
                  >
                    위에서 서비스를 검색·선택하세요.
                  </TableCell>
                </TableRow>
              ) : listLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-10"
                  >
                    <FinixLoading
                      size="md"
                      label="불러오는 중…"
                      inline
                      className="justify-center"
                    />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-10"
                  >
                    이 서비스에 적재된 테스트케이스가 없습니다. 활성 YAML 규칙이
                    있으면 「YAML에서 생성」을 눌러 주세요.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
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
                              title="해당 시나리오의 테스트케이스 화면으로 이동"
                            >
                              열기
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
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
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageShell>
  );
}
`;

const fixed = content.replace(/<\/?motion\.div/g, (m) =>
  m.includes("</") ? "</div" : "<div",
);

fs.writeFileSync(target, fixed, "utf8");
console.log("Wrote UTF-8", target);

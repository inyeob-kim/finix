import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  listTestCasesByServiceCode,
  materializeTestCasesForService,
} from "@/api/testcaseApi";
import { ApiError } from "@/api/client";
import type { TestCaseReadDto } from "@/api/types";
import { FinixPrimaryButton } from "../ui/finix-button";
import { FinixLoading } from "../ui/finix-loading";
import { TestCaseIoPreview } from "../TestCaseIoPreview";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-2 h-9 px-3 rounded-sm border border-border bg-background text-sm font-medium hover:bg-muted hover:border-primary/30 transition-colors disabled:opacity-50 disabled:pointer-events-none";

type RulesMetaTestCasesPanelProps = {
  serviceCode: string;
  serviceName?: string;
  active?: boolean;
  disabled?: boolean;
};

export function RulesMetaTestCasesPanel({
  serviceCode,
  serviceName,
  active = true,
  disabled = false,
}: RulesMetaTestCasesPanelProps) {
  const [rows, setRows] = useState<TestCaseReadDto[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateNotice, setGenerateNotice] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const code = serviceCode.trim();
  const serviceLabel = serviceName
    ? `${code} — ${serviceName}`
    : code || "—";

  const loadTestCases = useCallback(async () => {
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
  }, [code]);

  useEffect(() => {
    if (!active || !code) return;
    setExpandedId(null);
    void loadTestCases();
  }, [active, code, loadTestCases]);

  const handleGenerate = async () => {
    if (!code) return;
    setGenerateLoading(true);
    setListError(null);
    setGenerateNotice(null);
    try {
      const created = await materializeTestCasesForService(code, {
        replace_existing: replaceExisting,
      });
      setGenerateNotice(`${created.length}건의 테스트 케이스를 생성했습니다.`);
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

  const busy = disabled || generateLoading;

  return (
    <div className="flex flex-col gap-4 min-h-0 h-full">
      <p className="text-xs sm:text-sm text-muted-foreground shrink-0">
        이 서비스의 <span className="font-medium text-foreground">활성 YAML 규칙</span>
        에서 HTTP 테스트케이스를 생성·조회합니다. YAML을 저장·활성화한 뒤 생성하세요.
      </p>

      {listError ? (
        <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-3 py-2 shrink-0">
          {listError}
        </div>
      ) : null}

      <div className="rounded-sm border border-border bg-muted/20 p-4 space-y-4 shrink-0">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={(e) => setReplaceExisting(e.target.checked)}
            disabled={busy}
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
            disabled={busy || !code}
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
            disabled={listLoading || !code || disabled}
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
            {code ? `${serviceLabel} · ${rows.length}건` : "—"}
          </span>
        </div>
      </div>

      <div className="rounded-sm border border-border overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-y-auto flex-1 min-h-0">
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
              {listLoading ? (
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
                    <Fragment key={r.id}>
                      <TableRow
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
                        <TableCell className="max-w-[280px]">
                          <span className="line-clamp-2 text-sm">{r.name}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.scenario_id != null ? `#${r.scenario_id}` : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.method ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[200px] truncate">
                          {r.endpoint ?? "—"}
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.scenario_id != null ? (
                            <Link
                              to={`/test-case/${r.scenario_id}`}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              title="해당 시나리오의 테스트케이스 화면으로 이동"
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
                        <TableRow key={`${r.id}-detail`}>
                          <TableCell colSpan={7} className="p-0">
                            <TestCaseIoPreview test={r} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

import { ApiError } from "@/api/client";
import {
    listTestCasesByServiceCode,
    materializeTestCasesForService,
} from "@/api/testcaseApi";
import type { TestCaseReadDto } from "@/api/types";
import {
    ChevronDown,
    ChevronRight,
    ExternalLink,
    RefreshCw,
    Sparkles,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { TestCaseIoPreview } from "../TestCaseIoPreview";
import { FinixPrimaryButton } from "../ui/finix-button";
import { FinixLoading } from "../ui/finix-loading";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../ui/table";

/** Icon-only — matches YamlRulesEditPanel YAML 복사. */
const YAML_TOOLBAR_BTN_ICON =
  "h-9 w-9 inline-flex items-center justify-center rounded-sm border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";

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
    <div className="flex flex-col gap-3 min-h-0 h-full">
      <p className="text-xs sm:text-sm text-muted-foreground shrink-0 leading-snug">
        이 서비스의 <span className="font-medium text-foreground">활성 YAML 규칙</span>
        에서 HTTP 테스트케이스를 생성·조회합니다. YAML을 저장·활성화한 뒤 생성하세요.
      </p>

      {listError ? (
        <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-3 py-2 shrink-0">
          {listError}
        </div>
      ) : null}

      <div className="rounded-sm border border-border bg-muted/20 p-3 space-y-2 shrink-0">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
          <label className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none lg:max-w-[min(100%,22rem)] lg:shrink lg:pt-1.5">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              disabled={busy}
              className="mt-0.5 rounded border-border shrink-0"
            />
            <span className="leading-snug">
              기존 서비스 풀 테스트케이스를 삭제한 뒤 다시 생성
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
            <span className="text-xs text-muted-foreground min-w-0 truncate max-sm:basis-full max-sm:text-left">
              {code ? `${serviceLabel} · ${rows.length}건` : "—"}
            </span>
            <FinixPrimaryButton
              type="button"
              className="h-9 px-3 text-xs rounded-sm w-auto gap-1.5 shrink-0"
              disabled={busy || !code}
              onClick={() => void handleGenerate()}
            >
              {generateLoading ? (
                <FinixLoading size="sm" inline />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              YAML에서 생성
            </FinixPrimaryButton>
            <button
              type="button"
              className={YAML_TOOLBAR_BTN_ICON}
              disabled={listLoading || !code || disabled}
              title="목록 새로고침"
              aria-label="목록 새로고침"
              onClick={() => void loadTestCases()}
            >
              {listLoading ? (
                <FinixLoading size="sm" inline />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {generateNotice ? (
          <div className="rounded-sm border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 text-xs px-2.5 py-1.5 leading-snug">
            {generateNotice}
          </div>
        ) : null}
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

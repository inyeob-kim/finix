import { ApiError } from "@/api/client";
import {
  listTestCasesByServiceCode,
  materializeTestCasesForService,
} from "@/api/testcaseApi";
import type { TestCaseReadDto } from "@/api/types";
import {
  inferPathKindFromTestCase,
  testCaseMatchesQuery,
} from "@/lib/materializedTestCaseMeta";
import { RefreshCw, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmPopover } from "../scenarioRegistry/components/ConfirmPopover";
import { FinixPrimaryButton } from "../ui/finix-button";
import { FinixUnderlineInput } from "../ui/finix-form";
import { FinixLoading } from "../ui/finix-loading";
import { cn } from "../ui/utils";
import { RulesMetaTestCasesTable } from "./RulesMetaTestCasesTable";

const ICON_BTN =
  "h-9 w-9 inline-flex items-center justify-center rounded-sm border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";

type PathFilter = "" | "N" | "E";

type RulesMetaTestCasesPanelProps = {
  serviceCode: string;
  serviceName?: string;
  /** Operating (active) YAML version for this service, if any. */
  activeBundleVersion?: number | null;
  /** True when the open modal bundle is a draft, not the active one. */
  editingDraft?: boolean;
  active?: boolean;
  disabled?: boolean;
};

export function RulesMetaTestCasesPanel({
  serviceCode,
  serviceName,
  activeBundleVersion = null,
  editingDraft = false,
  active = true,
  disabled = false,
}: RulesMetaTestCasesPanelProps) {
  const [rows, setRows] = useState<TestCaseReadDto[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateNotice, setGenerateNotice] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [pathFilter, setPathFilter] = useState<PathFilter>("");

  const code = serviceCode.trim();
  const hasActiveYaml = activeBundleVersion != null;
  const serviceLabel = serviceName ? `${code} — ${serviceName}` : code || "—";

  const loadTestCases = useCallback(async () => {
    if (!code) {
      setRows([]);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      setRows(await listTestCasesByServiceCode(code, 500));
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
    setGenerateNotice(null);
    void loadTestCases();
  }, [active, code, loadTestCases]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (pathFilter && inferPathKindFromTestCase(r) !== pathFilter) return false;
      return testCaseMatchesQuery(r, query);
    });
  }, [rows, pathFilter, query]);

  const generateDisabledReason = (() => {
    if (!code) return "서비스를 선택하세요.";
    if (!hasActiveYaml) {
      return "적용된 YAML이 없습니다. YAML을 저장·적용한 뒤 생성하세요.";
    }
    if (disabled) return "다른 작업이 진행 중입니다.";
    if (generateLoading) return "생성 중입니다.";
    return null;
  })();

  const runGenerate = async () => {
    if (!code || generateDisabledReason) return;
    setReplaceConfirmOpen(false);
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

  const requestGenerate = () => {
    if (generateDisabledReason) return;
    if (replaceExisting && rows.length > 0) {
      setReplaceConfirmOpen(true);
      return;
    }
    void runGenerate();
  };

  const emptyMessage = !hasActiveYaml
    ? "적용된 YAML이 없어 테스트케이스를 생성할 수 없습니다. YAML 탭에서 저장·적용하세요."
    : rows.length === 0
      ? "이 서비스에 적재된 테스트케이스가 없습니다. 「YAML에서 생성」을 눌러 적용된 규칙으로 만들어 주세요."
      : "검색 조건에 맞는 테스트케이스가 없습니다.";

  const busy = disabled || generateLoading;

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full">
      {listError ? (
        <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-3 py-2 shrink-0">
          {listError}
        </div>
      ) : null}

      <div className="rounded-sm border border-border bg-muted/20 p-3 space-y-2 shrink-0">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
          <div className="flex flex-col gap-1.5 min-w-0 lg:max-w-[min(100%,24rem)]">
            <p className="text-xs text-muted-foreground leading-snug">
              생성 기준:{" "}
              {hasActiveYaml ? (
                <span className="font-medium text-foreground">
                  적용된 YAML
                </span>
              ) : (
                <span className="font-medium text-destructive">적용된 YAML 없음</span>
              )}
              {editingDraft && hasActiveYaml ? (
                <span>
                  {" "}
                  · 작업본은 반영되지 않습니다
                </span>
              ) : null}
            </p>
            <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                disabled={busy}
                className="mt-0.5 rounded border-border shrink-0"
              />
              <span className="leading-snug">
                기존 풀 테스트케이스를 삭제한 뒤 다시 생성
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
            <span className="text-xs text-muted-foreground min-w-0 truncate max-sm:basis-full">
              {code ? `${serviceLabel} · ${rows.length}건` : "—"}
            </span>
            <ConfirmPopover
              open={replaceConfirmOpen}
              onOpenChange={setReplaceConfirmOpen}
              align="end"
              title="기존 테스트케이스를 교체할까요?"
              description={`현재 풀 ${rows.length}건을 삭제한 뒤 적용된 YAML로 다시 생성합니다.`}
              cancelLabel="취소"
              confirmLabel="교체 생성"
              confirmClassName="h-8 px-3 rounded-sm bg-destructive text-destructive-foreground text-xs font-medium hover:opacity-90"
              onCancel={() => setReplaceConfirmOpen(false)}
              onConfirm={() => void runGenerate()}
              anchor={
                <span className="inline-flex shrink-0">
                  <FinixPrimaryButton
                    type="button"
                    className="h-9 px-3 text-xs rounded-sm w-auto gap-1.5"
                    disabled={Boolean(generateDisabledReason)}
                    title={generateDisabledReason ?? undefined}
                    onClick={requestGenerate}
                  >
                    {generateLoading ? (
                      <FinixLoading size="sm" inline />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    YAML에서 생성
                  </FinixPrimaryButton>
                </span>
              }
            />
            <button
              type="button"
              className={ICON_BTN}
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
          <div className="rounded-sm border border-primary/25 bg-primary/10 text-foreground text-xs px-2.5 py-1.5 leading-snug">
            {generateNotice}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 items-center shrink-0">
        <div className="flex gap-1 rounded-sm border border-border p-0.5">
          {(
            [
              { id: "" as const, label: "전체" },
              { id: "N" as const, label: "N" },
              { id: "E" as const, label: "E" },
            ] as const
          ).map((t) => (
            <button
              key={t.id || "all"}
              type="button"
              className={cn(
                "h-8 px-3 text-xs rounded-sm",
                pathFilter === t.id
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => setPathFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <FinixUnderlineInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·case_id·엔드포인트 검색"
            className="pl-7"
          />
        </div>
        {query || pathFilter ? (
          <span className="text-xs text-muted-foreground">
            {filteredRows.length}/{rows.length}건
          </span>
        ) : null}
      </div>

      <RulesMetaTestCasesTable
        rows={filteredRows}
        listLoading={listLoading}
        emptyMessage={emptyMessage}
        expandedId={expandedId}
        onToggleExpand={(id) =>
          setExpandedId((prev) => (prev === id ? null : id))
        }
      />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { History as HistoryGlyph, RotateCw, Search, X } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { listExecutions } from "@/api/executionApi";
import { getScenario } from "@/api/scenarioApi";
import { ApiError } from "@/api/client";
import {
  filterHistoryRows,
  historyPresetLabel,
  historyQueryRange,
  mapExecutionListItem,
  resolveScenarioTitles,
  todayDateInputValue,
  type ExecutionHistoryDatePreset,
} from "@/lib/executionHistoryView";
import type { ExecutionHistoryRow } from "@/lib/executionHistoryView";
import {
  PAGE_SECTION_STACK_CLASS,
} from "@/lib/finixShellLayout";
import { PageShell } from "./PageShell";
import { TablePagination } from "./ui/finix-pagination";
import { ExecutionHistoryEmptyState } from "./history/ExecutionHistoryEmptyState";
import { ExecutionHistoryFilterBar } from "./history/ExecutionHistoryFilterBar";
import { ExecutionHistoryTable } from "./history/ExecutionHistoryTable";
import { FinixUnderlineInput } from "./ui/finix-form";
import { FinixLoading } from "./ui/finix-loading";

export function History() {
  const [searchParams] = useSearchParams();
  const scenarioIdFilter = Number(searchParams.get("scenarioId"));
  const scenarioFilterActive =
    Number.isFinite(scenarioIdFilter) && scenarioIdFilter > 0
      ? scenarioIdFilter
      : null;

  const [datePreset, setDatePreset] =
    useState<ExecutionHistoryDatePreset>("7d");
  const [dateFrom, setDateFrom] = useState(todayDateInputValue);
  const [timeStart, setTimeStart] = useState("00:00");
  const [timeEnd, setTimeEnd] = useState("23:59");
  const [searchText, setSearchText] = useState("");
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<ExecutionHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scenarioFilterTitle, setScenarioFilterTitle] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setPage(1);
  }, [datePreset, dateFrom, timeStart, timeEnd, failuresOnly, scenarioFilterActive]);

  useEffect(() => {
    if (!scenarioFilterActive) {
      setScenarioFilterTitle(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const scenario = await getScenario(scenarioFilterActive);
        if (!cancelled) setScenarioFilterTitle(scenario.title ?? null);
      } catch {
        if (!cancelled) setScenarioFilterTitle(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarioFilterActive]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = historyQueryRange({
        preset: datePreset,
        dateFrom,
        timeStart,
        timeEnd,
      });
      const data = await listExecutions({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        scenario_id: scenarioFilterActive ?? undefined,
        ...range,
      });
      const titleMap = await resolveScenarioTitles(
        data.items.map((item) => item.scenario_id),
        async (id) => {
          const scenario = await getScenario(id);
          return scenario.title ?? null;
        },
      );
      setRows(
        data.items.map((item) =>
          mapExecutionListItem(
            item,
            item.scenario_id != null
              ? titleMap.get(item.scenario_id)
              : undefined,
          ),
        ),
      );
      setTotal(data.total);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(
        e instanceof ApiError ? e.message : "이력을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    dateFrom,
    datePreset,
    page,
    pageSize,
    refreshKey,
    scenarioFilterActive,
    timeEnd,
    timeStart,
  ]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const filteredRows = useMemo(
    () => filterHistoryRows(rows, searchText, failuresOnly),
    [rows, searchText, failuresOnly],
  );

  const failedOnPage = useMemo(
    () => rows.filter((r) => r.status === "failed").length,
    [rows],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pagesToShow = useMemo(() => {
    const out: number[] = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i += 1) out.push(i);
    return out;
  }, [currentPage, totalPages]);

  const presetLabel = historyPresetLabel(datePreset);

  return (
    <PageShell
      icon={<HistoryGlyph className="w-5 h-5" strokeWidth={2} />}
      title="테스트 이력 조회"
    >
      <div className={PAGE_SECTION_STACK_CLASS}>
      {scenarioFilterActive ? (
        <div className="rounded-sm border border-primary/25 bg-primary/5 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-foreground">
            시나리오 필터:{" "}
            <span className="font-medium">
              {scenarioFilterTitle?.trim() || `#${scenarioFilterActive}`}
            </span>
          </p>
          <Link
            to="/history"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            필터 해제
          </Link>
        </div>
      ) : null}

      <ExecutionHistoryFilterBar
        preset={datePreset}
        onPresetChange={setDatePreset}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        timeStart={timeStart}
        onTimeStartChange={setTimeStart}
        timeEnd={timeEnd}
        onTimeEndChange={setTimeEnd}
        failuresOnly={failuresOnly}
        onFailuresOnlyChange={setFailuresOnly}
        failedCount={failedOnPage}
        onRefresh={() => setRefreshKey((k) => k + 1)}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <FinixUnderlineInput
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="현재 페이지 검색 (실행 ID, 시나리오, Base URL)"
          className="h-10 pl-10 pr-11 bg-card"
        />
        <button
          type="button"
          aria-label="새로고침"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-sm hover:bg-muted transition-colors text-muted-foreground"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      {error ? (
        <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <FinixLoading inline label="이력을 불러오는 중…" />
      ) : (
        <ExecutionHistoryTable
          rows={filteredRows}
          emptySlot={
            <ExecutionHistoryEmptyState
              hasSearch={Boolean(searchText.trim()) || failuresOnly}
              presetLabel={presetLabel}
            />
          }
        />
      )}

      <TablePagination
        summary={
          <>
            전체 {total}건 · {currentPage}/{totalPages} 페이지
            {failuresOnly ? " · 실패만 표시" : ""}
          </>
        }
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        currentPage={currentPage}
        totalPages={totalPages}
        pagesToShow={pagesToShow}
        onPageChange={setPage}
        disabled={loading}
      />
      </div>
    </PageShell>
  );
}

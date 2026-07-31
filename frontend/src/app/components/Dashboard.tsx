import { useCallback, useEffect, useState } from "react";
import { Home, RotateCw } from "lucide-react";
import { ApiError } from "@/api/client";
import {
  getDashboardOverview,
  getPoolCoverage,
  type DashboardOverviewDto,
} from "@/api/dataPoolApi";
import { listExecutions } from "@/api/executionApi";
import { getScenario } from "@/api/scenarioApi";
import { listServiceRulesRegistry } from "@/api/serviceRulesApi";
import {
  historyQueryRange,
  mapExecutionListItem,
  resolveScenarioTitles,
  type ExecutionHistoryDatePreset,
  type ExecutionHistoryRow,
} from "@/lib/executionHistoryView";
import { PAGE_SECTION_STACK_CLASS } from "@/lib/finixShellLayout";
import { PageShell } from "./PageShell";
import { HistoryDashboardKpis } from "./history/HistoryDashboardKpis";
import {
  DashboardAttentionList,
  type CoverageGap,
} from "./dashboard/DashboardAttentionList";
import { DashboardRecentRuns } from "./dashboard/DashboardRecentRuns";
import { cn } from "./ui/utils";

type DatePreset = Extract<ExecutionHistoryDatePreset, "today" | "7d" | "30d">;

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: "today", label: "오늘" },
  { id: "7d", label: "7일" },
  { id: "30d", label: "30일" },
];

function toCoverageGaps(
  items: Array<{ service_code: string; happy: number; negative: number }>,
): CoverageGap[] {
  return items
    .filter((s) => s.happy === 0 || s.negative === 0)
    .map((s) => ({
      service_code: s.service_code,
      happy: s.happy,
      negative: s.negative,
    }));
}

export function Dashboard() {
  const [preset, setPreset] = useState<DatePreset>("7d");
  const [refreshKey, setRefreshKey] = useState(0);
  const [kpi, setKpi] = useState<DashboardOverviewDto | null>(null);
  const [recentRuns, setRecentRuns] = useState<ExecutionHistoryRow[]>([]);
  const [failedRuns, setFailedRuns] = useState<ExecutionHistoryRow[]>([]);
  const [draftRules, setDraftRules] = useState<
    Awaited<ReturnType<typeof listServiceRulesRegistry>>["items"]
  >([]);
  const [coverageGaps, setCoverageGaps] = useState<CoverageGap[]>([]);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setKpiLoading(true);
    setListLoading(true);
    setError(null);

    const range = historyQueryRange({
      preset,
      dateFrom: "",
      timeStart: "00:00",
      timeEnd: "23:59",
    });

    const [kpiResult, execResult, draftResult, coverageResult] =
      await Promise.allSettled([
        getDashboardOverview(range),
        listExecutions({ limit: 40, offset: 0, ...range }),
        listServiceRulesRegistry({ status: "draft", limit: 20, offset: 0 }),
        getPoolCoverage(50),
      ]);

    if (kpiResult.status === "fulfilled") {
      setKpi(kpiResult.value);
    } else {
      setKpi(null);
    }

    if (execResult.status === "fulfilled") {
      const titleMap = await resolveScenarioTitles(
        execResult.value.items.map((item) => item.scenario_id),
        async (id) => {
          const scenario = await getScenario(id);
          return scenario.title ?? null;
        },
      );
      const rows = execResult.value.items.map((item) =>
        mapExecutionListItem(
          item,
          item.scenario_id != null ? titleMap.get(item.scenario_id) : undefined,
        ),
      );
      setRecentRuns(rows.slice(0, 10));
      setFailedRuns(rows.filter((r) => r.status === "failed").slice(0, 5));
    } else {
      setRecentRuns([]);
      setFailedRuns([]);
    }

    if (draftResult.status === "fulfilled") {
      setDraftRules(draftResult.value.items);
    } else {
      setDraftRules([]);
    }

    if (coverageResult.status === "fulfilled") {
      setCoverageGaps(toCoverageGaps(coverageResult.value.items));
    } else {
      setCoverageGaps([]);
    }

    const failures = [
      kpiResult,
      execResult,
      draftResult,
      coverageResult,
    ].filter((r) => r.status === "rejected");
    if (failures.length === 4) {
      const first = failures[0];
      const reason =
        first.status === "rejected" ? first.reason : null;
      setError(
        reason instanceof ApiError
          ? reason.message
          : "대시보드 데이터를 불러오지 못했습니다.",
      );
    }

    setKpiLoading(false);
    setListLoading(false);
  }, [preset]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <PageShell
      icon={<Home className="size-5" strokeWidth={2} />}
      title="홈"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-card p-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  preset === p.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="새로고침"
            className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RotateCw className="size-3.5" />
          </button>
        </div>
      }
    >
      <div className={PAGE_SECTION_STACK_CLASS}>
        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {kpiLoading || kpi ? (
          <HistoryDashboardKpis data={kpi} loading={kpiLoading} compact />
        ) : (
          <div className="rounded-md border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            KPI를 불러오지 못했습니다. 새로고침해 보세요.
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2">
          <section className="min-w-0">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">
              지금 볼 것
            </h2>
            <DashboardAttentionList
              failedRuns={failedRuns}
              draftRules={draftRules}
              coverageGaps={coverageGaps}
              loading={listLoading}
            />
          </section>
          <section className="min-w-0">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">
              최근 활동
            </h2>
            <DashboardRecentRuns rows={recentRuns} loading={listLoading} />
          </section>
        </div>
      </div>
    </PageShell>
  );
}

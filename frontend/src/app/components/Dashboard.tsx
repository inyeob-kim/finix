import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { LayoutDashboard, RotateCw } from "lucide-react";
import { ApiError } from "@/api/client";
import {
  getDashboardOverview,
  getPoolCoverage,
  type DashboardOverviewDto,
} from "@/api/dataPoolApi";
import { listExecutions } from "@/api/executionApi";
import { getScenario } from "@/api/scenarioApi";
import { listServiceRulesRegistry } from "@/api/serviceRulesApi";
import type { ExecutionListItemDto } from "@/api/types";
import { loadRegistryState } from "@/app/components/scenarioRegistry/storage";
import { useAuthStore } from "@/app/auth/authStore";
import {
  buildCollectionHealth,
  buildCoverageBars,
  buildDashboardKpis,
  buildExecutionTrend,
  countRunningExecutions,
  selectDashboardRunItems,
  type CollectionHealthRow,
  type CoverageBar,
  type DashboardPreset,
  type ExecutionTrendPoint,
} from "@/lib/dashboardMetrics";
import {
  historyPresetLabel,
  historyQueryRange,
  mapExecutionListItem,
  resolveScenarioTitles,
  type ExecutionHistoryRow,
} from "@/lib/executionHistoryView";
import { PAGE_SECTION_STACK_CLASS } from "@/lib/finixShellLayout";
import { PageShell } from "./PageShell";
import {
  DashboardAttentionList,
  type CoverageGap,
} from "./dashboard/DashboardAttentionList";
import { DashboardCollectionHealth } from "./dashboard/DashboardCollectionHealth";
import { DashboardCoverageChart } from "./dashboard/DashboardCoverageChart";
import { DashboardKpiCards } from "./dashboard/DashboardKpiCards";
import { DashboardPanel } from "./dashboard/DashboardPanel";
import { DashboardRecentRuns } from "./dashboard/DashboardRecentRuns";
import {
  DashboardTrendChart,
  TREND_BODY_MAX_HEIGHT_CLASS,
} from "./dashboard/DashboardTrendChart";
import { cn } from "./ui/utils";

const PRESETS: { id: DashboardPreset; label: string }[] = [
  { id: "today", label: "오늘" },
  { id: "7d", label: "7일" },
  { id: "30d", label: "30일" },
];

/** Backend caps execution paging at 100 rows per request. */
const EXECUTION_FETCH_LIMIT = 100;
const COVERAGE_FETCH_LIMIT = 50;
const DRAFT_FETCH_LIMIT = 20;

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
  const username = useAuthStore((state) => state.user?.username ?? "guest");
  const [preset, setPreset] = useState<DashboardPreset>("7d");
  const [refreshKey, setRefreshKey] = useState(0);
  const [kpi, setKpi] = useState<DashboardOverviewDto | null>(null);
  const [trend, setTrend] = useState<ExecutionTrendPoint[]>([]);
  const [runningCount, setRunningCount] = useState(0);
  const [recentRuns, setRecentRuns] = useState<ExecutionHistoryRow[]>([]);
  const [failedRuns, setFailedRuns] = useState<ExecutionHistoryRow[]>([]);
  const [collectionHealth, setCollectionHealth] = useState<
    CollectionHealthRow[]
  >([]);
  const [draftRules, setDraftRules] = useState<
    Awaited<ReturnType<typeof listServiceRulesRegistry>>["items"]
  >([]);
  const [coverageGaps, setCoverageGaps] = useState<CoverageGap[]>([]);
  const [coverageBars, setCoverageBars] = useState<CoverageBar[]>([]);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyExecutions = useCallback(
    async (
      items: ExecutionListItemDto[],
      activePreset: DashboardPreset,
      updatedBy: string,
    ) => {
      setTrend(buildExecutionTrend(items, { preset: activePreset }));
      setRunningCount(countRunningExecutions(items));

      const registry = loadRegistryState(updatedBy);
      setCollectionHealth(
        buildCollectionHealth(registry.folders, registry.scenarios, items),
      );

      const selection = selectDashboardRunItems(items);
      const titleMap = await resolveScenarioTitles(
        selection.scenarioIds,
        async (id) => {
          const scenario = await getScenario(id);
          return scenario.title ?? null;
        },
      );
      const toRow = (item: ExecutionListItemDto) =>
        mapExecutionListItem(
          item,
          item.scenario_id != null ? titleMap.get(item.scenario_id) : undefined,
        );

      setRecentRuns(selection.recent.map(toRow));
      setFailedRuns(selection.failed.map(toRow));
    },
    [],
  );

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
        listExecutions({ limit: EXECUTION_FETCH_LIMIT, offset: 0, ...range }),
        listServiceRulesRegistry({
          status: "draft",
          limit: DRAFT_FETCH_LIMIT,
          offset: 0,
        }),
        getPoolCoverage(COVERAGE_FETCH_LIMIT),
      ]);

    setKpi(kpiResult.status === "fulfilled" ? kpiResult.value : null);

    if (execResult.status === "fulfilled") {
      await applyExecutions(execResult.value.items, preset, username);
    } else {
      setTrend(buildExecutionTrend([], { preset }));
      setRunningCount(0);
      const registry = loadRegistryState(username);
      setCollectionHealth(
        buildCollectionHealth(registry.folders, registry.scenarios, []),
      );
      setRecentRuns([]);
      setFailedRuns([]);
    }

    setDraftRules(draftResult.status === "fulfilled" ? draftResult.value.items : []);

    if (coverageResult.status === "fulfilled") {
      setCoverageGaps(toCoverageGaps(coverageResult.value.items));
      setCoverageBars(buildCoverageBars(coverageResult.value.items));
    } else {
      setCoverageGaps([]);
      setCoverageBars([]);
    }

    const failures = [kpiResult, execResult, draftResult, coverageResult].filter(
      (result) => result.status === "rejected",
    );
    if (failures.length === 4) {
      const reason = failures[0].status === "rejected" ? failures[0].reason : null;
      setError(
        reason instanceof ApiError
          ? reason.message
          : "대시보드 데이터를 불러오지 못했습니다.",
      );
    }

    setKpiLoading(false);
    setListLoading(false);
  }, [applyExecutions, preset, username]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const kpis = useMemo(() => buildDashboardKpis(kpi), [kpi]);
  const trendTotal = useMemo(
    () => trend.reduce((sum, point) => sum + point.runs, 0),
    [trend],
  );
  const rangeLabel = historyPresetLabel(preset);
  const collectionHealthSubtitle =
    collectionHealth.length > 0
      ? `${rangeLabel} · 컬렉션 ${collectionHealth.length}개`
      : `${rangeLabel} · 이 브라우저 레지스트리 기준`;

  return (
    <PageShell
      icon={<LayoutDashboard className="size-5" strokeWidth={2} />}
      title="대시보드"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {runningCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
              </span>
              실행 중 {runningCount}
            </span>
          ) : null}
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
            <RotateCw
              className={cn("size-3.5", kpiLoading && "animate-spin")}
            />
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

        <DashboardKpiCards items={kpis} loading={kpiLoading} />

        <div className="grid gap-5 xl:grid-cols-3">
          <DashboardPanel
            title="실행 추이"
            subtitle={`${rangeLabel} · 총 ${trendTotal}건`}
            index={0}
            className="xl:col-span-2"
          >
            <DashboardTrendChart points={trend} loading={listLoading} />
          </DashboardPanel>

          <DashboardPanel
            title="컬렉션 헬스"
            subtitle={collectionHealthSubtitle}
            index={1}
            bodyClassName={cn(
              "overflow-y-auto overscroll-contain",
              TREND_BODY_MAX_HEIGHT_CLASS,
            )}
            action={
              <Link
                to="/scenario-registry"
                className="text-[11px] text-muted-foreground hover:text-primary"
              >
                시나리오 관리
              </Link>
            }
          >
            <DashboardCollectionHealth
              rows={collectionHealth}
              loading={listLoading}
            />
          </DashboardPanel>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <DashboardPanel
            title="지금 볼 것"
            subtitle="실패 · 초안 · 커버리지 공백"
            index={2}
          >
            <DashboardAttentionList
              failedRuns={failedRuns}
              draftRules={draftRules}
              coverageGaps={coverageGaps}
              loading={listLoading}
            />
          </DashboardPanel>

          <DashboardPanel
            title="최근 활동"
            subtitle="최신 실행 10건"
            index={3}
            action={
              <Link
                to="/history"
                className="text-[11px] text-muted-foreground hover:text-primary"
              >
                전체 보기
              </Link>
            }
          >
            <DashboardRecentRuns rows={recentRuns} loading={listLoading} />
          </DashboardPanel>
        </div>

        <DashboardPanel
          title="서비스별 Pool 커버리지"
          subtitle="샘플 보유 상위 서비스"
          index={4}
          action={
            <Link
              to="/data-pool"
              className="text-[11px] text-muted-foreground hover:text-primary"
            >
              Data Pool
            </Link>
          }
        >
          <DashboardCoverageChart bars={coverageBars} loading={listLoading} />
        </DashboardPanel>
      </div>
    </PageShell>
  );
}

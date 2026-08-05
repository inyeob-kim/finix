import type { ExecutionListItemDto } from "@/api/types";
import type { DashboardOverviewDto } from "@/api/dataPoolApi";
import type {
  ScenarioRegistryFolder,
  ScenarioRegistryItem,
} from "@/app/components/scenarioRegistry/types";
import { resolveScenarioSaveStatus } from "@/app/components/scenarioRegistry/wizardPersist";
import { deriveExecutionHistoryStatus } from "@/lib/executionHistoryView";
import { countBindingRows } from "@/lib/scenarioBindings";

export type DashboardPreset = "today" | "7d" | "30d";

export type TrendGranularity = "hour" | "day";

export type ExecutionTrendPoint = {
  key: string;
  label: string;
  runs: number;
  passed: number;
  failed: number;
  running: number;
};

export type DashboardKpiTone = "primary" | "success" | "destructive" | "neutral";

export type DashboardKpi = {
  id: string;
  label: string;
  value: number;
  display: string;
  hint: string;
  tone: DashboardKpiTone;
  /** 0..1 fill for the mini progress bar; omitted when there is no denominator. */
  ratio?: number;
};

export type CoverageBar = {
  service_code: string;
  happy: number;
  negative: number;
  total: number;
};

export type CollectionPassRate = {
  folderId: string;
  folderName: string;
  passed: number;
  failed: number;
  total: number;
  percent: number;
  display: string;
};

export type CollectionHealthRow = {
  folderId: string;
  folderName: string;
  scenarioCount: number;
  readyCount: number;
  draftCount: number;
  readyPercent: number;
  readyDisplay: string;
  runs: number;
  passed: number;
  failed: number;
  passPercent: number;
  passDisplay: string;
  /** Multi-step scenarios with no extract/inject/override bindings. */
  unboundCount: number;
};

const DAY_BUCKETS: Record<Exclude<DashboardPreset, "today">, number> = {
  "7d": 7,
  "30d": 30,
};

const TOP_COVERAGE_SERVICES = 8;
const TOP_COLLECTION_FOLDERS = 8;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function hourKey(date: Date): string {
  return `${dayKey(date)}T${pad2(date.getHours())}`;
}

export function trendGranularity(preset: DashboardPreset): TrendGranularity {
  return preset === "today" ? "hour" : "day";
}

function bucketCount(preset: DashboardPreset, now: Date): number {
  if (preset === "today") return now.getHours() + 1;
  return DAY_BUCKETS[preset];
}

function bucketKeyOf(date: Date, granularity: TrendGranularity): string {
  return granularity === "hour" ? hourKey(date) : dayKey(date);
}

function emptyBuckets(
  preset: DashboardPreset,
  now: Date,
): ExecutionTrendPoint[] {
  const granularity = trendGranularity(preset);
  const count = bucketCount(preset, now);
  const points: ExecutionTrendPoint[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(now);
    let label: string;
    if (granularity === "hour") {
      cursor.setMinutes(0, 0, 0);
      cursor.setHours(cursor.getHours() - offset);
      label = `${cursor.getHours()}시`;
    } else {
      cursor.setHours(0, 0, 0, 0);
      cursor.setDate(cursor.getDate() - offset);
      label = `${cursor.getMonth() + 1}/${cursor.getDate()}`;
    }
    points.push({
      key: bucketKeyOf(cursor, granularity),
      label,
      runs: 0,
      passed: 0,
      failed: 0,
      running: 0,
    });
  }

  return points;
}

/** Bucket executions into a continuous timeline so the chart never shows gaps. */
export function buildExecutionTrend(
  items: ExecutionListItemDto[],
  options: { preset: DashboardPreset; now?: Date },
): ExecutionTrendPoint[] {
  const now = options.now ?? new Date();
  const granularity = trendGranularity(options.preset);
  const points = emptyBuckets(options.preset, now);
  const byKey = new Map(points.map((point) => [point.key, point]));

  for (const item of items) {
    const occurred = new Date(item.created_at);
    if (Number.isNaN(occurred.getTime())) continue;
    const point = byKey.get(bucketKeyOf(occurred, granularity));
    if (!point) continue;

    point.runs += 1;
    const status = deriveExecutionHistoryStatus(item);
    if (status === "failed") point.failed += 1;
    else if (status === "running") point.running += 1;
    else point.passed += 1;
  }

  return points;
}

function percentDisplay(passed: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((passed / total) * 100)}%`;
}

function percentValue(passed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((passed / total) * 100);
}

export type PassRateSummary = {
  passed: number;
  failed: number;
  total: number;
  percent: number;
  display: string;
};

export function buildStepPassRate(
  data: DashboardOverviewDto | null,
): PassRateSummary {
  const passed = data?.executions.steps_passed ?? 0;
  const failed = data?.executions.steps_failed ?? 0;
  const total = passed + failed;
  return {
    passed,
    failed,
    total,
    percent: percentValue(passed, total),
    display: percentDisplay(passed, total),
  };
}

export function buildDashboardKpis(
  data: DashboardOverviewDto | null,
): DashboardKpi[] {
  if (!data) return [];

  const { pool, executions } = data;
  const stepTotal = executions.steps_passed + executions.steps_failed;
  const errorTotal =
    executions.expected_error_passed + executions.expected_error_failed;
  const happyTotal =
    executions.happy_replay_passed + executions.happy_replay_failed;

  return [
    {
      id: "pool",
      label: "Pool 전체",
      value: pool.total,
      display: pool.total.toLocaleString("ko-KR"),
      hint: `Happy ${pool.happy} · Negative ${pool.negative}`,
      tone: "neutral",
      ratio: pool.total > 0 ? pool.happy / pool.total : undefined,
    },
    {
      id: "runs",
      label: "실행 런",
      value: executions.runs_total,
      display: executions.runs_total.toLocaleString("ko-KR"),
      hint: `완료 ${executions.runs_completed}건`,
      tone: "primary",
      ratio:
        executions.runs_total > 0
          ? executions.runs_completed / executions.runs_total
          : undefined,
    },
    {
      id: "steps",
      label: "스텝 Pass",
      value: executions.steps_passed,
      display: executions.steps_passed.toLocaleString("ko-KR"),
      hint: `Fail ${executions.steps_failed}건`,
      tone: executions.steps_failed > 0 ? "destructive" : "success",
      ratio: stepTotal > 0 ? executions.steps_passed / stepTotal : undefined,
    },
    {
      id: "expected-error",
      label: "Expected Error",
      value: percentValue(executions.expected_error_passed, errorTotal),
      display: percentDisplay(executions.expected_error_passed, errorTotal),
      hint: `${executions.expected_error_passed}/${errorTotal} 통과`,
      tone: "success",
      ratio:
        errorTotal > 0 ? executions.expected_error_passed / errorTotal : undefined,
    },
    {
      id: "happy-replay",
      label: "Happy Replay",
      value: percentValue(executions.happy_replay_passed, happyTotal),
      display: percentDisplay(executions.happy_replay_passed, happyTotal),
      hint: `${executions.happy_replay_passed}/${happyTotal} 통과`,
      tone: "success",
      ratio:
        happyTotal > 0 ? executions.happy_replay_passed / happyTotal : undefined,
    },
  ];
}

export function buildCoverageBars(
  items: Array<{ service_code: string; happy: number; negative: number }>,
  limit = TOP_COVERAGE_SERVICES,
): CoverageBar[] {
  return items
    .map((item) => ({
      service_code: item.service_code,
      happy: item.happy,
      negative: item.negative,
      total: item.happy + item.negative,
    }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total || a.service_code.localeCompare(b.service_code))
    .slice(0, limit);
}

export type DashboardRunSelection = {
  recent: ExecutionListItemDto[];
  failed: ExecutionListItemDto[];
  scenarioIds: Array<number | null>;
};

/**
 * Pick only the executions rendered in lists so scenario titles are fetched
 * for a bounded set even when the trend query returns hundreds of rows.
 */
export function selectDashboardRunItems(
  items: ExecutionListItemDto[],
  options?: { recentLimit?: number; failedLimit?: number },
): DashboardRunSelection {
  const recent = items.slice(0, options?.recentLimit ?? 10);
  const failed = items
    .filter((item) => deriveExecutionHistoryStatus(item) === "failed")
    .slice(0, options?.failedLimit ?? 5);

  return {
    recent,
    failed,
    scenarioIds: [...recent, ...failed].map((item) => item.scenario_id),
  };
}

export function countRunningExecutions(items: ExecutionListItemDto[]): number {
  return items.filter(
    (item) => deriveExecutionHistoryStatus(item) === "running",
  ).length;
}

function folderDescendantsMap(
  folders: ScenarioRegistryFolder[],
): Map<string, Set<string>> {
  const childrenByParent = new Map<string, string[]>();
  folders.forEach((folder) => {
    if (!folder.parentId) return;
    const siblings = childrenByParent.get(folder.parentId) ?? [];
    siblings.push(folder.id);
    childrenByParent.set(folder.parentId, siblings);
  });

  const cache = new Map<string, Set<string>>();
  const descendantsOf = (id: string): Set<string> => {
    const cached = cache.get(id);
    if (cached) return cached;
    const set = new Set<string>([id]);
    const stack = [...(childrenByParent.get(id) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (set.has(current)) continue;
      set.add(current);
      (childrenByParent.get(current) ?? []).forEach((child) => stack.push(child));
    }
    cache.set(id, set);
    return set;
  };

  folders.forEach((folder) => {
    descendantsOf(folder.id);
  });
  return cache;
}

/**
 * Join local registry folders with DB executions via ``backendScenarioId``.
 * Each folder includes runs from scenarios in its descendant folders.
 */
export function buildCollectionPassRates(
  folders: ScenarioRegistryFolder[],
  scenarios: ScenarioRegistryItem[],
  executions: ExecutionListItemDto[],
  limit = TOP_COLLECTION_FOLDERS,
): CollectionPassRate[] {
  if (folders.length === 0 || executions.length === 0) return [];

  const folderNameById = new Map(folders.map((folder) => [folder.id, folder.name]));
  const scenarioFolderByBackendId = new Map<number, string>();
  scenarios.forEach((scenario) => {
    const backendId = scenario.backendScenarioId;
    if (backendId == null || !Number.isFinite(backendId)) return;
    scenarioFolderByBackendId.set(backendId, scenario.folderId);
  });

  const descendantsByFolder = folderDescendantsMap(folders);
  const countsByFolder = new Map<string, { passed: number; failed: number }>();
  folders.forEach((folder) => {
    countsByFolder.set(folder.id, { passed: 0, failed: 0 });
  });

  for (const execution of executions) {
    const scenarioId = execution.scenario_id;
    if (scenarioId == null) continue;
    const folderId = scenarioFolderByBackendId.get(scenarioId);
    if (!folderId) continue;

    const status = deriveExecutionHistoryStatus(execution);
    if (status === "running") continue;

    for (const [ancestorId, descendants] of descendantsByFolder) {
      if (!descendants.has(folderId)) continue;
      const bucket = countsByFolder.get(ancestorId);
      if (!bucket) continue;
      if (status === "failed") bucket.failed += 1;
      else bucket.passed += 1;
    }
  }

  return folders
    .map((folder) => {
      const bucket = countsByFolder.get(folder.id) ?? { passed: 0, failed: 0 };
      const total = bucket.passed + bucket.failed;
      return {
        folderId: folder.id,
        folderName: folderNameById.get(folder.id) ?? folder.id,
        passed: bucket.passed,
        failed: bucket.failed,
        total,
        percent: percentValue(bucket.passed, total),
        display: percentDisplay(bucket.passed, total),
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || a.folderName.localeCompare(b.folderName))
    .slice(0, limit);
}

function isUnboundMultiStep(scenario: ScenarioRegistryItem): boolean {
  const picks = scenario.selectedRuleTestcases ?? [];
  if (picks.length < 2) return false;
  return countBindingRows(scenario.stepBindingsByStepKey) === 0;
}

/**
 * Collection health: size, ready ratio, period runs/pass, unbound multi-step.
 * Counts roll up into ancestor folders (same tree as pass rates).
 */
export function buildCollectionHealth(
  folders: ScenarioRegistryFolder[],
  scenarios: ScenarioRegistryItem[],
  executions: ExecutionListItemDto[],
  /** Defaults to every non-empty collection; the panel scrolls instead of truncating. */
  limit = Number.MAX_SAFE_INTEGER,
): CollectionHealthRow[] {
  if (folders.length === 0) return [];

  const descendantsByFolder = folderDescendantsMap(folders);
  const scenarioFolderByBackendId = new Map<number, string>();
  scenarios.forEach((scenario) => {
    const backendId = scenario.backendScenarioId;
    if (backendId == null || !Number.isFinite(backendId)) return;
    scenarioFolderByBackendId.set(backendId, scenario.folderId);
  });

  type Acc = {
    scenarioCount: number;
    readyCount: number;
    draftCount: number;
    unboundCount: number;
    passed: number;
    failed: number;
  };
  const byFolder = new Map<string, Acc>();
  folders.forEach((folder) => {
    byFolder.set(folder.id, {
      scenarioCount: 0,
      readyCount: 0,
      draftCount: 0,
      unboundCount: 0,
      passed: 0,
      failed: 0,
    });
  });

  for (const scenario of scenarios) {
    for (const [ancestorId, descendants] of descendantsByFolder) {
      if (!descendants.has(scenario.folderId)) continue;
      const acc = byFolder.get(ancestorId);
      if (!acc) continue;
      acc.scenarioCount += 1;
      if (resolveScenarioSaveStatus(scenario) === "draft") acc.draftCount += 1;
      else acc.readyCount += 1;
      if (isUnboundMultiStep(scenario)) acc.unboundCount += 1;
    }
  }

  for (const execution of executions) {
    const scenarioId = execution.scenario_id;
    if (scenarioId == null) continue;
    const folderId = scenarioFolderByBackendId.get(scenarioId);
    if (!folderId) continue;
    const status = deriveExecutionHistoryStatus(execution);
    if (status === "running") continue;

    for (const [ancestorId, descendants] of descendantsByFolder) {
      if (!descendants.has(folderId)) continue;
      const acc = byFolder.get(ancestorId);
      if (!acc) continue;
      if (status === "failed") acc.failed += 1;
      else acc.passed += 1;
    }
  }

  return folders
    .map((folder) => {
      const acc = byFolder.get(folder.id) ?? {
        scenarioCount: 0,
        readyCount: 0,
        draftCount: 0,
        unboundCount: 0,
        passed: 0,
        failed: 0,
      };
      const runs = acc.passed + acc.failed;
      return {
        folderId: folder.id,
        folderName: folder.name,
        scenarioCount: acc.scenarioCount,
        readyCount: acc.readyCount,
        draftCount: acc.draftCount,
        readyPercent: percentValue(acc.readyCount, acc.scenarioCount),
        readyDisplay: percentDisplay(acc.readyCount, acc.scenarioCount),
        runs,
        passed: acc.passed,
        failed: acc.failed,
        passPercent: percentValue(acc.passed, runs),
        passDisplay: percentDisplay(acc.passed, runs),
        unboundCount: acc.unboundCount,
      };
    })
    .filter((row) => row.scenarioCount > 0)
    .sort(
      (a, b) =>
        b.scenarioCount - a.scenarioCount ||
        b.runs - a.runs ||
        a.folderName.localeCompare(b.folderName),
    )
    .slice(0, limit);
}

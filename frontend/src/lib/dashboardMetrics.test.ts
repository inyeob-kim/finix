import { describe, expect, it } from "vitest";
import type { ExecutionListItemDto } from "@/api/types";
import type { DashboardOverviewDto } from "@/api/dataPoolApi";
import type {
  ScenarioRegistryFolder,
  ScenarioRegistryItem,
} from "@/app/components/scenarioRegistry/types";
import {
  buildCollectionPassRates,
  buildCollectionHealth,
  buildCoverageBars,
  buildDashboardKpis,
  buildExecutionTrend,
  buildStepPassRate,
  countRunningExecutions,
  selectDashboardRunItems,
} from "@/lib/dashboardMetrics";

function execution(
  partial: Partial<ExecutionListItemDto> & Pick<ExecutionListItemDto, "id" | "created_at">,
): ExecutionListItemDto {
  return {
    scenario_id: 1,
    base_url: "http://localhost",
    status: "completed",
    summary: { passed: 3, failed: 0 },
    ...partial,
  };
}

function overview(
  executions: Partial<DashboardOverviewDto["executions"]>,
): DashboardOverviewDto {
  return {
    pool: { total: 10, happy: 6, negative: 4, by_source: {} },
    executions: {
      runs_total: 0,
      runs_completed: 0,
      steps_passed: 0,
      steps_failed: 0,
      assertion_passed: 0,
      assertion_failed: 0,
      expected_error_passed: 0,
      expected_error_failed: 0,
      happy_replay_passed: 0,
      happy_replay_failed: 0,
      ...executions,
    },
  };
}

describe("buildExecutionTrend", () => {
  const now = new Date(2026, 7, 5, 14, 30);

  it("returns one bucket per day for the 7d preset", () => {
    const points = buildExecutionTrend([], { preset: "7d", now });
    expect(points).toHaveLength(7);
    expect(points[6].label).toBe("8/5");
    expect(points[0].label).toBe("7/30");
  });

  it("returns hourly buckets from midnight for the today preset", () => {
    const points = buildExecutionTrend([], { preset: "today", now });
    expect(points).toHaveLength(15);
    expect(points[0].label).toBe("0시");
    expect(points[14].label).toBe("14시");
  });

  it("counts runs into the matching bucket by status", () => {
    const items = [
      execution({ id: 1, created_at: new Date(2026, 7, 5, 9).toISOString() }),
      execution({
        id: 2,
        created_at: new Date(2026, 7, 5, 10).toISOString(),
        summary: { passed: 1, failed: 2 },
      }),
      execution({
        id: 3,
        created_at: new Date(2026, 7, 4, 10).toISOString(),
        status: "running",
        summary: {},
      }),
    ];
    const points = buildExecutionTrend(items, { preset: "7d", now });
    const today = points[points.length - 1];
    const yesterday = points[points.length - 2];

    expect(today).toMatchObject({ runs: 2, passed: 1, failed: 1, running: 0 });
    expect(yesterday).toMatchObject({ runs: 1, passed: 0, failed: 0, running: 1 });
  });

  it("ignores executions outside the window and unparsable timestamps", () => {
    const items = [
      execution({ id: 1, created_at: new Date(2026, 6, 1).toISOString() }),
      execution({ id: 2, created_at: "not-a-date" }),
    ];
    const points = buildExecutionTrend(items, { preset: "7d", now });
    expect(points.every((point) => point.runs === 0)).toBe(true);
  });
});

describe("buildStepPassRate", () => {
  it("computes the percentage of passing steps", () => {
    const rate = buildStepPassRate(overview({ steps_passed: 9, steps_failed: 1 }));
    expect(rate).toMatchObject({ total: 10, percent: 90, display: "90%" });
  });

  it("falls back to a dash when nothing ran", () => {
    expect(buildStepPassRate(null)).toMatchObject({ percent: 0, display: "—" });
  });
});

describe("buildDashboardKpis", () => {
  it("returns an empty list without data", () => {
    expect(buildDashboardKpis(null)).toEqual([]);
  });

  it("marks the step card destructive when failures exist", () => {
    const kpis = buildDashboardKpis(
      overview({ steps_passed: 8, steps_failed: 2 }),
    );
    const steps = kpis.find((kpi) => kpi.id === "steps");
    expect(steps).toMatchObject({ tone: "destructive", display: "8", ratio: 0.8 });
  });

  it("renders rate cards as percentages", () => {
    const kpis = buildDashboardKpis(
      overview({ expected_error_passed: 3, expected_error_failed: 1 }),
    );
    expect(kpis.find((kpi) => kpi.id === "expected-error")?.display).toBe("75%");
    expect(kpis.find((kpi) => kpi.id === "happy-replay")?.display).toBe("—");
  });
});

describe("buildCoverageBars", () => {
  it("sorts by sample count and drops empty services", () => {
    const bars = buildCoverageBars(
      [
        { service_code: "A", happy: 1, negative: 1 },
        { service_code: "B", happy: 5, negative: 2 },
        { service_code: "C", happy: 0, negative: 0 },
      ],
      2,
    );
    expect(bars.map((bar) => bar.service_code)).toEqual(["B", "A"]);
    expect(bars[0].total).toBe(7);
  });
});

describe("selectDashboardRunItems", () => {
  const items = [
    execution({ id: 1, created_at: "2026-08-05T10:00:00Z", scenario_id: 11 }),
    execution({
      id: 2,
      created_at: "2026-08-05T09:00:00Z",
      scenario_id: 12,
      summary: { passed: 0, failed: 1 },
    }),
    execution({ id: 3, created_at: "2026-08-05T08:00:00Z", scenario_id: 13 }),
  ];

  it("limits recent and failed slices independently", () => {
    const selection = selectDashboardRunItems(items, {
      recentLimit: 1,
      failedLimit: 5,
    });
    expect(selection.recent.map((item) => item.id)).toEqual([1]);
    expect(selection.failed.map((item) => item.id)).toEqual([2]);
    expect(selection.scenarioIds).toEqual([11, 12]);
  });
});

describe("countRunningExecutions", () => {
  it("counts only in-flight runs", () => {
    const items = [
      execution({ id: 1, created_at: "2026-08-05T10:00:00Z", status: "running", summary: {} }),
      execution({ id: 2, created_at: "2026-08-05T09:00:00Z" }),
    ];
    expect(countRunningExecutions(items)).toBe(1);
  });
});

const folder = (
  partial: Pick<ScenarioRegistryFolder, "id" | "name"> &
    Partial<ScenarioRegistryFolder>,
): ScenarioRegistryFolder => ({
  parentId: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  updatedBy: "tester",
  ...partial,
});

const scenario = (
  partial: Pick<ScenarioRegistryItem, "id" | "folderId" | "title"> &
    Partial<ScenarioRegistryItem>,
): ScenarioRegistryItem => ({
  description: "",
  tags: [],
  serviceSequence: [],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  updatedBy: "tester",
  ...partial,
});

describe("buildCollectionPassRates", () => {
  const folders: ScenarioRegistryFolder[] = [
    folder({ id: "root", name: "Root" }),
    folder({ id: "child", name: "Child", parentId: "root" }),
  ];

  it("rolls child-folder executions up to the parent collection", () => {
    const scenarios = [
      scenario({
        id: "s1",
        folderId: "child",
        title: "Scenario A",
        backendScenarioId: 101,
      }),
    ];
    const executions = [
      execution({ id: 1, created_at: "2026-08-05T10:00:00Z", scenario_id: 101 }),
      execution({
        id: 2,
        created_at: "2026-08-05T09:00:00Z",
        scenario_id: 101,
        summary: { passed: 0, failed: 1 },
      }),
    ];

    const rates = buildCollectionPassRates(folders, scenarios, executions);
    const root = rates.find((row) => row.folderId === "root");
    const child = rates.find((row) => row.folderId === "child");

    expect(root).toMatchObject({ passed: 1, failed: 1, total: 2, percent: 50 });
    expect(child).toMatchObject({ passed: 1, failed: 1, total: 2, percent: 50 });
  });

  it("skips scenarios without backendScenarioId", () => {
    const scenarios = [
      scenario({ id: "s1", folderId: "child", title: "Draft only" }),
    ];
    const executions = [
      execution({ id: 1, created_at: "2026-08-05T10:00:00Z", scenario_id: 101 }),
    ];

    expect(buildCollectionPassRates(folders, scenarios, executions)).toEqual([]);
  });

  it("returns an empty list when there are no executions", () => {
    const scenarios = [
      scenario({
        id: "s1",
        folderId: "child",
        title: "Scenario A",
        backendScenarioId: 101,
      }),
    ];
    expect(buildCollectionPassRates(folders, scenarios, [])).toEqual([]);
  });
});

describe("buildCollectionHealth", () => {
  const folders: ScenarioRegistryFolder[] = [
    folder({ id: "root", name: "Root" }),
    folder({ id: "child", name: "Child", parentId: "root" }),
  ];

  it("rolls scenario counts and ready/draft into ancestors", () => {
    const scenarios = [
      scenario({
        id: "s1",
        folderId: "child",
        title: "Ready one",
        backendScenarioId: 101,
        saveStatus: "ready",
      }),
      scenario({
        id: "s2",
        folderId: "child",
        title: "Draft one",
        saveStatus: "draft",
      }),
    ];
    const rates = buildCollectionHealth(folders, scenarios, []);
    const root = rates.find((row) => row.folderId === "root");
    expect(root).toMatchObject({
      scenarioCount: 2,
      readyCount: 1,
      draftCount: 1,
      readyPercent: 50,
      runs: 0,
      passDisplay: "—",
    });
  });

  it("counts multi-step scenarios without bindings as unbound", () => {
    const scenarios = [
      scenario({
        id: "s1",
        folderId: "child",
        title: "Unbound",
        selectedRuleTestcases: [
          {
            id: "a",
            serviceCode: "CU008",
            serviceName: "CU008",
            title: "A",
          },
          {
            id: "b",
            serviceCode: "DP000",
            serviceName: "DP000",
            title: "B",
          },
        ],
        stepBindingsByStepKey: {},
      }),
      scenario({
        id: "s2",
        folderId: "child",
        title: "Bound",
        selectedRuleTestcases: [
          {
            id: "a",
            serviceCode: "CU008",
            serviceName: "CU008",
            title: "A",
          },
          {
            id: "b",
            serviceCode: "DP000",
            serviceName: "DP000",
            title: "B",
          },
        ],
        stepBindingsByStepKey: {
          a: {
            extracts: [{ var: "custId", json_path: "$.custId" }],
            injects: [],
            overrides: [],
          },
        },
      }),
    ];
    const rates = buildCollectionHealth(folders, scenarios, []);
    expect(rates.find((row) => row.folderId === "child")?.unboundCount).toBe(1);
  });

  it("joins period runs via backendScenarioId", () => {
    const scenarios = [
      scenario({
        id: "s1",
        folderId: "child",
        title: "Scenario A",
        backendScenarioId: 101,
      }),
    ];
    const executions = [
      execution({ id: 1, created_at: "2026-08-05T10:00:00Z", scenario_id: 101 }),
      execution({
        id: 2,
        created_at: "2026-08-05T09:00:00Z",
        scenario_id: 101,
        summary: { passed: 0, failed: 1 },
      }),
    ];
    const rates = buildCollectionHealth(folders, scenarios, executions);
    expect(rates.find((row) => row.folderId === "root")).toMatchObject({
      runs: 2,
      passed: 1,
      failed: 1,
      passPercent: 50,
    });
  });

  it("omits empty folders", () => {
    expect(buildCollectionHealth(folders, [], [])).toEqual([]);
  });
});

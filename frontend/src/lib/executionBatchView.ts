import type { CollectionScenarioRunRow } from "@/lib/registryScenarioRun";

export type ExecutionBatchMeta = {
  runs: CollectionScenarioRunRow[];
  skipped: number;
  errors: string[];
  collectionName?: string;
};

export type ExecutionBatchListItem = {
  executionId: number;
  title: string;
  scenarioId: number;
  passed: number;
  failed: number;
  failedScenario: boolean;
};

export function parseExecutionIdsFromSearch(search: string): number[] {
  const params = new URLSearchParams(search);
  const raw = params.get("ids") ?? "";
  const seen = new Set<number>();
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const id = Number(part.trim());
    if (!Number.isFinite(id) || id < 1 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function buildExecutionBatchPath(ids: number[]): string {
  if (ids.length === 0) return "/execution-batch";
  return `/execution-batch?ids=${ids.join(",")}`;
}

export function batchItemsFromMeta(meta: ExecutionBatchMeta): ExecutionBatchListItem[] {
  return meta.runs.map((row) => ({
    executionId: row.executionId,
    title: row.title,
    scenarioId: row.scenarioId,
    passed: row.passed,
    failed: row.failed,
    failedScenario: row.failed > 0,
  }));
}

export function summarizeBatch(items: ExecutionBatchListItem[]) {
  const scenarioCount = items.length;
  const failedScenarios = items.filter((i) => i.failedScenario).length;
  const passedSteps = items.reduce((sum, i) => sum + i.passed, 0);
  const failedSteps = items.reduce((sum, i) => sum + i.failed, 0);
  return {
    scenarioCount,
    failedScenarios,
    passedSteps,
    failedSteps,
    allScenariosPassed: failedScenarios === 0 && scenarioCount > 0,
  };
}

export function firstFailedExecutionId(
  items: ExecutionBatchListItem[],
): number | null {
  return items.find((i) => i.failedScenario)?.executionId ?? null;
}

import { runScenarioExecution } from "@/api/executionApi";
import { ApiError } from "@/api/client";
import type { ScenarioRegistryItem } from "@/app/components/scenarioRegistry/types";
import { migrateBindingsToStepKeys } from "@/lib/scenarioBindings";
import { mergeExportPostmanConfig } from "@/lib/postmanExportDownload";
import { persistRegistryScenarioToDb } from "@/lib/registryScenarioPersist";
import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import { canExportRegistryScenarioPostman } from "@/lib/registryScenarioExport";

export type ScenarioRunMode = "simulate" | "live";

export function canRunRegistryScenario(item: ScenarioRegistryItem): boolean {
  return canExportRegistryScenarioPostman(item);
}

async function persistRegistryItemForRun(
  item: ScenarioRegistryItem,
  postmanConfig?: ScenarioPostmanConfig,
): Promise<number> {
  if (!canRunRegistryScenario(item)) {
    throw new Error(
      "실행하려면 시나리오에 DB 테스트 케이스가 포함되어 있어야 합니다.",
    );
  }
  const picks = item.selectedRuleTestcases ?? [];
  const stepBindingsByStepKey = migrateBindingsToStepKeys(
    picks.map((p) => p.id),
    picks,
    item.stepBindingsByStepKey ?? item.stepBindingsByCode,
  );
  const { scenarioId } = await persistRegistryScenarioToDb({
    title: item.title,
    prompt: item.description?.trim() || item.title,
    serviceSequence: item.serviceSequence ?? [],
    stepBindingsByStepKey,
    selectedRuleTestcases: picks,
    postmanConfig,
    existingScenarioId: item.backendScenarioId,
  });
  return scenarioId;
}

export async function runRegistryScenario(input: {
  item: ScenarioRegistryItem;
  postmanConfig?: ScenarioPostmanConfig;
  mode?: ScenarioRunMode;
}): Promise<{
  scenarioId: number;
  executionId: number;
  summary: { passed?: number; failed?: number };
}> {
  try {
    const scenarioId = await persistRegistryItemForRun(
      input.item,
      input.postmanConfig,
    );
    const baseUrl = input.postmanConfig?.baseUrl?.trim() ?? "";
    const exec = await runScenarioExecution({
      scenario_id: scenarioId,
      base_url: baseUrl,
      mode: input.mode ?? "live",
    });
    const summary = exec.summary as { passed?: number; failed?: number };
    return { scenarioId, executionId: exec.id, summary };
  } catch (e) {
    if (e instanceof ApiError) {
      throw new Error(e.message);
    }
    throw e;
  }
}

export type CollectionScenarioRunRow = {
  itemId: string;
  title: string;
  scenarioId: number;
  executionId: number;
  passed: number;
  failed: number;
};

export type CollectionScenarioRunResult = {
  runs: CollectionScenarioRunRow[];
  skipped: number;
  errors: string[];
};

export async function runRegistryCollectionScenarios(
  items: ScenarioRegistryItem[],
  options?: {
    baseUrlOverride?: string;
    mode?: ScenarioRunMode;
    stopOnFailure?: boolean;
  },
  onProgress?: (done: number, total: number) => void,
): Promise<CollectionScenarioRunResult> {
  const exportable = items
    .filter(canRunRegistryScenario)
    .map((item) => ({
      ...item,
      postmanConfig: mergeExportPostmanConfig(
        item.postmanConfig,
        options?.baseUrlOverride,
      ),
    }));
  const skipped = items.length - exportable.length;
  if (exportable.length === 0) {
    throw new Error(
      "실행할 시나리오가 없습니다. DB 테스트 케이스가 포함된 시나리오만 실행할 수 있습니다.",
    );
  }

  const runs: CollectionScenarioRunRow[] = [];
  const errors: string[] = [];
  let done = 0;

  for (const item of exportable) {
    try {
      const { scenarioId, executionId, summary } = await runRegistryScenario({
        item,
        postmanConfig: item.postmanConfig,
        mode: options?.mode ?? "live",
      });
      runs.push({
        itemId: item.id,
        title: item.title,
        scenarioId,
        executionId,
        passed: summary.passed ?? 0,
        failed: summary.failed ?? 0,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "시나리오 실행에 실패했습니다.";
      errors.push(`${item.title}: ${message}`);
      if (options?.stopOnFailure) {
        break;
      }
    }
    done += 1;
    onProgress?.(done, exportable.length);
  }

  if (runs.length === 0) {
    throw new Error(errors[0] ?? "시나리오 실행에 실패했습니다.");
  }

  return { runs, skipped, errors };
}

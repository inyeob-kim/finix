import {
  runScenarioExecution,
  streamScenarioExecution,
  type ExecutionStreamEvent,
} from "@/api/executionApi";
import { ApiError } from "@/api/client";
import type { ScenarioRegistryItem } from "@/app/components/scenarioRegistry/types";
import type { ScenarioRunFocusStep } from "@/app/components/scenario/ScenarioRunFocusProgress";
import {
  consumeExecutionProgressStream,
  type ExecutionRunProgressState,
} from "@/lib/executionProgressStream";
import { migrateBindingsToStepKeys } from "@/lib/scenarioBindings";
import { mergeExportPostmanConfig } from "@/lib/postmanExportDownload";
import { persistRegistryScenarioToDb } from "@/lib/registryScenarioPersist";
import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import { canExportRegistryScenarioPostman } from "@/lib/registryScenarioExport";
import {
  buildRunStepsFromPicks,
  runStepHeadline,
} from "@/lib/scenarioRunSequence";

export type ScenarioRunMode = "simulate" | "live";

export type ScenarioRunProgressState = ExecutionRunProgressState;

export function canRunRegistryScenario(item: ScenarioRegistryItem): boolean {
  return canExportRegistryScenarioPostman(item);
}

export function focusStepsFromRegistryItem(
  item: ScenarioRegistryItem,
): ScenarioRunFocusStep[] {
  const runSteps = buildRunStepsFromPicks(item.selectedRuleTestcases ?? []);
  return runSteps.map((step) => ({
    key: step.stepKey,
    label: runStepHeadline(step),
  }));
}

export async function consumeScenarioExecutionStream(
  body: {
    scenario_id: number;
    base_url?: string;
    mode?: ScenarioRunMode;
  },
  seedSteps: ScenarioRunFocusStep[],
  onProgress: (state: ScenarioRunProgressState) => void,
  signal?: AbortSignal,
): Promise<Extract<ExecutionStreamEvent, { type: "done" }>> {
  return consumeExecutionProgressStream(
    (onEvent, abortSignal) => streamScenarioExecution(body, onEvent, abortSignal),
    seedSteps,
    onProgress,
    signal,
  );
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
  onProgress?: (state: ScenarioRunProgressState) => void;
}): Promise<{
  scenarioId: number;
  executionId: number;
  summary: { passed?: number; failed?: number };
}> {
  try {
    const { preparePicksForLiveRun } = await import("@/lib/preparePicksForLiveRun");
    const prepared = await preparePicksForLiveRun(
      input.item.selectedRuleTestcases ?? [],
    );
    if (prepared.error) {
      throw new Error(prepared.error);
    }
    const item = {
      ...input.item,
      selectedRuleTestcases: prepared.picks,
    };
    const scenarioId = await persistRegistryItemForRun(
      item,
      input.postmanConfig,
    );
    const baseUrl = input.postmanConfig?.baseUrl?.trim() ?? "";
    const mode = input.mode ?? "live";

    if (input.onProgress) {
      const done = await consumeScenarioExecutionStream(
        {
          scenario_id: scenarioId,
          base_url: baseUrl,
          mode,
        },
        focusStepsFromRegistryItem(item),
        input.onProgress,
      );
      return {
        scenarioId,
        executionId: done.execution_id,
        summary: {
          passed: done.summary.passed,
          failed: done.summary.failed,
        },
      };
    }

    const exec = await runScenarioExecution({
      scenario_id: scenarioId,
      base_url: baseUrl,
      mode,
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
      const message =
        e instanceof Error ? e.message : "시나리오 실행에 실패했습니다.";
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

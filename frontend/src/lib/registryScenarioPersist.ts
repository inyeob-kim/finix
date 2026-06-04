import { createScenario, saveScenarioDefinition } from "@/api/scenarioApi";
import {
  buildScenarioStepsWithBindings,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
  buildPerStepFromRunSteps,
  buildRunStepsFromPicks,
} from "@/lib/scenarioRunSequence";
import type { ScenarioRuleTestcaseRef } from "@/app/components/scenarioRegistry/types";
import {
  ensurePostmanConfig,
  postmanConfigToApi,
  type ScenarioPostmanConfig,
} from "@/lib/scenarioPostmanVariables";

export async function persistRegistryScenarioToDb(input: {
  title: string;
  prompt?: string;
  serviceSequence: Array<{ code: string; name: string }>;
  stepBindingsByStepKey?: StepBindingsByStepKey;
  selectedRuleTestcases?: ScenarioRuleTestcaseRef[];
  postmanConfig?: ScenarioPostmanConfig;
  /** When set, update this scenario instead of creating a new row. */
  existingScenarioId?: number;
}): Promise<{ scenarioId: number; hasAttachedCases: boolean }> {
  const title = input.title.trim() || "시나리오";
  const scenarioId =
    input.existingScenarioId != null && Number.isFinite(input.existingScenarioId)
      ? input.existingScenarioId
      : (
          await createScenario({
            prompt: input.prompt?.trim() || title,
            title,
          })
        ).id;
  const picks = input.selectedRuleTestcases ?? [];
  const nameByCode = Object.fromEntries(
    input.serviceSequence.map((s) => [s.code, s.name]),
  );
  const runSteps = buildRunStepsFromPicks(picks, nameByCode);
  const perStep = buildPerStepFromRunSteps(runSteps);
  const hasPoolPicks = perStep.some((row) => row.length > 0);
  const normalizedPostman = ensurePostmanConfig(input.postmanConfig);
  const postman = postmanConfigToApi(normalizedPostman);
  await saveScenarioDefinition(scenarioId, {
    title,
    steps: buildScenarioStepsWithBindings(
      runSteps.map((s) => ({
        stepKey: s.stepKey,
        code: s.serviceCode,
        name: s.serviceName,
        title: s.title,
      })),
      input.stepBindingsByStepKey,
    ),
    postman,
    per_step: hasPoolPicks ? perStep : undefined,
    mark_saved: true,
  });
  return { scenarioId, hasAttachedCases: hasPoolPicks };
}

import {
  emptyStepBinding,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";

export type BindingClearStats = {
  extractCount: number;
  injectCount: number;
  overrideCount: number;
};

export function countBindingStats(
  runSteps: Array<{ stepKey: string }>,
  bindings: StepBindingsByStepKey,
): BindingClearStats {
  let extractCount = 0;
  let injectCount = 0;
  let overrideCount = 0;
  for (const step of runSteps) {
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    extractCount += cfg.extracts.length;
    injectCount += cfg.injects.length;
    overrideCount += cfg.overrides.length;
  }
  return { extractCount, injectCount, overrideCount };
}

export function clearAllScenarioBindings(
  runSteps: Array<{ stepKey: string }>,
  bindings: StepBindingsByStepKey,
  options: { clearOverrides?: boolean } = {},
): StepBindingsByStepKey {
  const next = { ...bindings };
  for (const step of runSteps) {
    const cfg = next[step.stepKey] ?? emptyStepBinding();
    next[step.stepKey] = {
      extracts: [],
      injects: [],
      overrides: options.clearOverrides ? [] : [...cfg.overrides],
    };
  }
  return next;
}

export function clearInjectsOnly(
  runSteps: Array<{ stepKey: string }>,
  bindings: StepBindingsByStepKey,
): StepBindingsByStepKey {
  const next = { ...bindings };
  for (const step of runSteps) {
    const cfg = next[step.stepKey] ?? emptyStepBinding();
    if (cfg.injects.length === 0) continue;
    next[step.stepKey] = { ...cfg, injects: [] };
  }
  return next;
}

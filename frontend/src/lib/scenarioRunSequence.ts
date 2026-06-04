import type { ScenarioRuleTestcaseRef } from "@/app/components/scenarioRegistry/types";
import { parseMaterializedTestcaseName } from "@/lib/materializedTestcaseName";

/** Human-readable subtitle (short label or title), never service name. */
export function runStepShortDescription(step: ScenarioRunStep): string {
  const parsed = parseMaterializedTestcaseName(step.title, step.serviceCode);
  if (parsed.shortLabel?.trim()) return parsed.shortLabel.trim();
  const t = step.title?.trim();
  if (t && t.length <= 72) return t;
  return "";
}

/** Primary line: ``PY023-N-001 · …`` (testcase-first). */
export function runStepHeadline(step: ScenarioRunStep): string {
  const id = runStepCaseIdLabel(step);
  const sub = runStepShortDescription(step);
  if (!sub || sub === id) return id;
  return `${id} · ${sub}`;
}

/** Step reference for lists: ``[1] PY023-N-001``. */
export function runStepRefAt(
  runSteps: ScenarioRunStep[],
  stepIndex: number,
): string {
  const step = runSteps[stepIndex];
  if (!step) return `[${stepIndex + 1}]`;
  return `[${stepIndex + 1}] ${runStepCaseIdLabel(step)}`;
}

/** One executed step in the scenario = one selected testcase (step 1 order). */
export type ScenarioRunStep = {
  stepKey: string;
  order: number;
  serviceCode: string;
  serviceName: string;
  /** YAML case_id e.g. ``PY023-N-001``. */
  ruleId?: string;
  title: string;
  backendTestcaseId?: number;
};

/** Label for run-step chips (``PY023-N-001`` style). */
export function runStepCaseIdLabel(step: ScenarioRunStep): string {
  const id = step.ruleId?.trim();
  if (id) return id;
  return String(step.order);
}

export function buildRunStepsFromPicks(
  picks: ScenarioRuleTestcaseRef[],
  serviceNameByCode?: Record<string, string>,
): ScenarioRunStep[] {
  return picks.map((p, idx) => {
    const title = p.title?.trim() || p.serviceCode;
    const ruleId =
      p.ruleId?.trim() ||
      parseMaterializedTestcaseName(title, p.serviceCode).ruleId;
    return {
      stepKey: p.id,
      order: idx + 1,
      serviceCode: p.serviceCode,
      serviceName:
        p.serviceName?.trim() ||
        serviceNameByCode?.[p.serviceCode] ||
        p.serviceCode,
      ruleId,
      title,
      backendTestcaseId: p.backendTestcaseId,
    };
  });
}

/** ``per_step[i]`` = pool testcase ids for run step ``i`` (1:1 with pick order). */
export function buildPerStepFromRunSteps(steps: ScenarioRunStep[]): number[][] {
  return steps.map((s) =>
    s.backendTestcaseId != null && Number.isFinite(s.backendTestcaseId)
      ? [s.backendTestcaseId]
      : [],
  );
}

export function serviceNameMapFromDrafts(
  drafts: Array<{ code: string; name: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of drafts) {
    out[d.code] = d.name;
  }
  return out;
}

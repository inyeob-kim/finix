import type { ScenarioRuleTestcaseRef } from "@/app/components/scenarioRegistry/types";

/** Stable identity of the underlying TC/rule (not the scenario step instance). */
export function scenarioPickSourceKey(row: ScenarioRuleTestcaseRef): string {
  const ruleId = row.ruleId?.trim();
  if (ruleId) return `rule:${row.serviceCode}:${ruleId}`;
  if (row.backendTestcaseId != null && Number.isFinite(row.backendTestcaseId)) {
    return `tc:${row.backendTestcaseId}`;
  }
  return `id:${row.id}`;
}

/** New scenario step instance — unique id, same backend TC / rule. */
export function createScenarioPickInstance(
  template: ScenarioRuleTestcaseRef,
  newId: () => string,
): ScenarioRuleTestcaseRef {
  return {
    ...template,
    id: `pick-${newId()}`,
  };
}

export function countPicksBySourceKey(
  picks: readonly ScenarioRuleTestcaseRef[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of picks) {
    const key = scenarioPickSourceKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** 1-based occurrence among picks that share the same source TC. */
export function scenarioPickOccurrence(
  picks: readonly ScenarioRuleTestcaseRef[],
  index: number,
): number {
  const row = picks[index];
  if (!row) return 1;
  const key = scenarioPickSourceKey(row);
  let n = 0;
  for (let i = 0; i <= index; i++) {
    const cur = picks[i];
    if (cur && scenarioPickSourceKey(cur) === key) n += 1;
  }
  return n;
}

import type { ScenarioRuleTestcaseRef } from "@/app/components/scenarioRegistry/types";
import { parseMaterializedTestcaseName } from "@/lib/materializedTestcaseName";
import { normalizeCaseType } from "@/lib/yamlRulesDocument";

export type ScenarioCaseType = "E" | "N";
export type ScenarioCaseTypeFilter = "all" | ScenarioCaseType;

export function resolveScenarioCaseType(
  row: ScenarioRuleTestcaseRef,
): ScenarioCaseType {
  const fromField = row.ruleType?.trim();
  if (fromField) {
    return normalizeCaseType(fromField);
  }
  const parsed = parseMaterializedTestcaseName(row.title, row.serviceCode);
  if (parsed.ruleType) {
    return parsed.ruleType;
  }
  return "N";
}

export function countScenarioCaseTypes(
  rows: ScenarioRuleTestcaseRef[],
): { all: number; N: number; E: number } {
  let nCount = 0;
  let eCount = 0;
  for (const row of rows) {
    if (resolveScenarioCaseType(row) === "E") {
      eCount += 1;
    } else {
      nCount += 1;
    }
  }
  return { all: rows.length, N: nCount, E: eCount };
}

export function filterScenarioCaseType(
  rows: ScenarioRuleTestcaseRef[],
  filter: ScenarioCaseTypeFilter,
): ScenarioRuleTestcaseRef[] {
  if (filter === "all") return rows;
  return rows.filter((row) => resolveScenarioCaseType(row) === filter);
}

export function selectedCaseTypeSummary(
  rows: ScenarioRuleTestcaseRef[],
): string {
  const { N, E } = countScenarioCaseTypes(rows);
  if (rows.length === 0) return "";
  return `N ${N} · E ${E}`;
}

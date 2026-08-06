import type { TestCaseReadDto } from "@/api/types";
import type { ScenarioRunFocusStep } from "@/app/components/scenario/ScenarioRunFocusProgress";

/** Seed progress steps in the order the backend executes the pool (ascending rule_case_id). */
export function focusStepsFromPoolTestCases(
  rows: TestCaseReadDto[],
): ScenarioRunFocusStep[] {
  return [...rows]
    .sort((a, b) => a.rule_case_id.localeCompare(b.rule_case_id))
    .map((row, index) => ({
      key: `testcase-${row.svc_code}-${row.rule_case_id}`,
      label: row.name?.trim() || `Step ${index + 1}`,
    }));
}

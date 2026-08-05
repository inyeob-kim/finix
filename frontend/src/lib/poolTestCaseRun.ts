import type { TestCaseReadDto } from "@/api/types";
import type { ScenarioRunFocusStep } from "@/app/components/scenario/ScenarioRunFocusProgress";

/** Seed progress steps in the order the backend executes the pool (ascending id). */
export function focusStepsFromPoolTestCases(
  rows: TestCaseReadDto[],
): ScenarioRunFocusStep[] {
  return [...rows]
    .sort((a, b) => a.id - b.id)
    .map((row, index) => ({
      key: `testcase-${row.id}`,
      label: row.name?.trim() || `Step ${index + 1}`,
    }));
}

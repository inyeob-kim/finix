import { describe, expect, it } from "vitest";
import type { ScenarioRuleTestcaseRef } from "@/app/components/scenarioRegistry/types";
import {
  countScenarioCaseTypes,
  filterScenarioCaseType,
  resolveScenarioCaseType,
  selectedCaseTypeSummary,
} from "@/lib/scenarioCaseTypeFilter";

function ref(
  partial: Partial<ScenarioRuleTestcaseRef> & Pick<ScenarioRuleTestcaseRef, "id">,
): ScenarioRuleTestcaseRef {
  return {
    serviceCode: "PY025",
    serviceName: "Test",
    title: partial.title ?? partial.id,
    ...partial,
  };
}

describe("scenarioCaseTypeFilter", () => {
  it("resolves E from ruleType or name prefix", () => {
    expect(
      resolveScenarioCaseType(
        ref({
          id: "1",
          ruleType: "E",
          title: "[E] PY025-E-001 · AAPCME0006",
        }),
      ),
    ).toBe("E");
    expect(
      resolveScenarioCaseType(
        ref({ id: "2", title: "[E] PY025-E-002 · code" }),
      ),
    ).toBe("E");
  });

  it("counts and filters pool by case type", () => {
    const pool = [
      ref({ id: "n1", title: "[N] PY025-N-001" }),
      ref({ id: "e1", title: "[E] PY025-E-001" }),
      ref({ id: "n2", ruleType: "N", title: "legacy" }),
    ];
    expect(countScenarioCaseTypes(pool)).toEqual({ all: 3, N: 2, E: 1 });
    expect(filterScenarioCaseType(pool, "E")).toHaveLength(1);
    expect(filterScenarioCaseType(pool, "N")).toHaveLength(2);
  });

  it("formats selected summary", () => {
    expect(
      selectedCaseTypeSummary([
        ref({ id: "n1", title: "[N] A" }),
        ref({ id: "e1", title: "[E] B" }),
      ]),
    ).toBe("N 1 · E 1");
  });
});

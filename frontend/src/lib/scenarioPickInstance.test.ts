import { describe, expect, it } from "vitest";
import type { ScenarioRuleTestcaseRef } from "@/app/components/scenarioRegistry/types";
import {
  countPicksBySourceKey,
  createScenarioPickInstance,
  scenarioPickOccurrence,
  scenarioPickSourceKey,
} from "./scenarioPickInstance";

const base: ScenarioRuleTestcaseRef = {
  id: "tc-10",
  serviceCode: "AC001",
  serviceName: "계좌개설",
  ruleId: "AC001-N-001",
  title: "정상 개설",
  backendTestcaseId: 10,
};

describe("scenarioPickInstance", () => {
  it("creates unique pick ids for the same TC", () => {
    let n = 0;
    const a = createScenarioPickInstance(base, () => `id-${++n}`);
    const b = createScenarioPickInstance(base, () => `id-${++n}`);
    expect(a.id).toBe("pick-id-1");
    expect(b.id).toBe("pick-id-2");
    expect(a.backendTestcaseId).toBe(10);
    expect(b.backendTestcaseId).toBe(10);
    expect(scenarioPickSourceKey(a)).toBe(scenarioPickSourceKey(b));
  });

  it("counts occurrences for duplicate steps", () => {
    const picks = [
      createScenarioPickInstance(base, () => "a"),
      {
        ...base,
        id: "other",
        backendTestcaseId: 99,
        ruleId: "AC001-N-002",
      },
      createScenarioPickInstance(base, () => "b"),
    ];
    expect(scenarioPickOccurrence(picks, 0)).toBe(1);
    expect(scenarioPickOccurrence(picks, 2)).toBe(2);
    expect(countPicksBySourceKey(picks).get("tc:10")).toBe(2);
  });
});

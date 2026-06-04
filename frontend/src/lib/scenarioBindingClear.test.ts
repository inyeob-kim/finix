import { describe, expect, it } from "vitest";
import {
  clearAllScenarioBindings,
  clearInjectsOnly,
  countBindingStats,
} from "@/lib/scenarioBindingClear";
import { emptyStepBinding } from "@/lib/scenarioBindings";
import { countLinkedConnections } from "@/lib/scenarioConnectionUx";
import type { ScenarioRunStep } from "@/lib/scenarioRunSequence";

const runSteps = [{ stepKey: "a" }, { stepKey: "b" }];

const runStepsFull: ScenarioRunStep[] = [
  {
    stepKey: "a",
    order: 0,
    serviceCode: "S1",
    serviceName: "S1",
    title: "T1",
    ruleId: "C1",
  },
  {
    stepKey: "b",
    order: 1,
    serviceCode: "S2",
    serviceName: "S2",
    title: "T2",
    ruleId: "C2",
  },
];

describe("scenarioBindingClear", () => {
  it("countBindingStats sums rows", () => {
    const stats = countBindingStats(runSteps, {
      a: {
        extracts: [{ var: "x", json_path: "$.x" }],
        injects: [],
        overrides: [{ json_path: "$.y", value: 1 }],
      },
      b: {
        extracts: [],
        injects: [{ var: "x", json_path: "$.x" }],
        overrides: [],
      },
    });
    expect(stats).toEqual({ extractCount: 1, injectCount: 1, overrideCount: 1 });
  });

  it("clearAllScenarioBindings keeps overrides by default", () => {
    const bindings = {
      a: {
        extracts: [{ var: "x", json_path: "$.x" }],
        injects: [],
        overrides: [{ json_path: "$.y", value: 1 }],
      },
    };
    const next = clearAllScenarioBindings(runSteps, bindings);
    expect(next.a).toEqual({
      extracts: [],
      injects: [],
      overrides: [{ json_path: "$.y", value: 1 }],
    });
  });

  it("countLinkedConnections counts only completed inject links", () => {
    const bindings = {
      a: {
        extracts: [{ var: "x", json_path: "$.x" }],
        injects: [],
        overrides: [],
      },
      b: {
        extracts: [],
        injects: [{ var: "x", json_path: "$.x" }],
        overrides: [],
      },
    };
    expect(countLinkedConnections(runStepsFull, bindings)).toEqual({
      linked: 1,
      orphanInjects: 0,
      savedOnlyExtracts: 0,
    });
    expect(
      countLinkedConnections(runStepsFull, {
        a: bindings.a,
        b: { extracts: [], injects: [], overrides: [] },
      }),
    ).toEqual({
      linked: 0,
      orphanInjects: 0,
      savedOnlyExtracts: 1,
    });
  });

  it("clearInjectsOnly leaves extracts", () => {
    const bindings = {
      a: emptyStepBinding(),
      b: {
        extracts: [],
        injects: [{ var: "x", json_path: "$.x" }],
        overrides: [],
      },
    };
    const next = clearInjectsOnly(runSteps, bindings);
    expect(next.b?.injects).toEqual([]);
  });
});

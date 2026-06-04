import { describe, expect, it } from "vitest";
import type { ScenarioRunStep } from "@/lib/scenarioRunSequence";
import {
  buildRuntimeFlowExceptions,
  pruneOrphanInjects,
} from "@/lib/scenarioRuntimeContext";
import type { StepBindingsByStepKey } from "@/lib/scenarioBindings";

function step(key: string, idx: number): ScenarioRunStep {
  return {
    stepKey: key,
    order: idx + 1,
    serviceCode: "SVC",
    serviceName: "Service",
    title: `Case ${idx + 1}`,
  };
}

describe("pruneOrphanInjects", () => {
  const runSteps = [step("a", 0), step("b", 1)];

  it("removes injects when collection var is deleted", () => {
    const bindings: StepBindingsByStepKey = {
      b: {
        extracts: [],
        injects: [{ var: "instCd", json_path: "instCd" }],
      },
    };
    const next = pruneOrphanInjects(runSteps, bindings, []);
    expect(next.b?.injects).toHaveLength(0);
    expect(
      buildRuntimeFlowExceptions(runSteps, next, []).length,
    ).toBe(0);
  });

  it("keeps inject when var remains in start vars", () => {
    const bindings: StepBindingsByStepKey = {
      b: {
        extracts: [],
        injects: [{ var: "instCd", json_path: "instCd" }],
      },
    };
    const next = pruneOrphanInjects(runSteps, bindings, ["instCd"]);
    expect(next.b?.injects).toHaveLength(1);
  });
});

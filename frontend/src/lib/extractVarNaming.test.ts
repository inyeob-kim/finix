import { describe, expect, it } from "vitest";
import type { ScenarioRunStep } from "@/lib/scenarioRunSequence";
import {
  allocateUniqueExtractVarName,
  collectTakenVarNames,
  injectVarDisplayLabel,
  isVarNameTaken,
  removeExtractAndDependentInjects,
  renameExtractVarInScenario,
  suggestAlternateVarNames,
} from "@/lib/extractVarNaming";
import { upsertInject } from "@/lib/scenarioBindings";
import { upsertExtract, type StepBindingsByStepKey } from "@/lib/scenarioBindings";

function step(key: string, idx: number): ScenarioRunStep {
  return {
    stepKey: key,
    order: idx + 1,
    serviceCode: "SVC",
    serviceName: "Service",
    title: `Case ${idx + 1}`,
    ruleId: `TC-${idx + 1}`,
  };
}

describe("extractVarNaming", () => {
  const runSteps = [step("a", 0), step("b", 1), step("c", 2)];

  it("collectTakenVarNames includes extracts and start vars", () => {
    const bindings: StepBindingsByStepKey = {
      a: { extracts: [{ var: "acctNo", json_path: "acctNo" }], injects: [] },
    };
    const taken = collectTakenVarNames(runSteps, bindings, ["baseUrl"]);
    expect(isVarNameTaken("acctNo", taken)).toBe(true);
    expect(isVarNameTaken("baseUrl", taken)).toBe(true);
    expect(isVarNameTaken("other", taken)).toBe(false);
  });

  it("suggestAlternateVarNames skips taken names", () => {
    const taken = new Set(["acctno"]);
    const names = suggestAlternateVarNames("acctNo", taken, 1, runSteps);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => !isVarNameTaken(n, taken))).toBe(true);
  });

  it("renameExtractVarInScenario updates downstream injects from same source", () => {
    let bindings: StepBindingsByStepKey = {};
    bindings = upsertExtract(bindings, "a", "acctNo", "acctNo");
    bindings = {
      ...bindings,
      b: {
        extracts: [],
        injects: [{ var: "acctNo", json_path: "targetAcct" }],
      },
    };
    const next = renameExtractVarInScenario(
      runSteps,
      bindings,
      0,
      "acctNo",
      "fromAcctNo",
    );
    expect(next.a?.extracts[0]?.var).toBe("fromAcctNo");
    expect(next.b?.injects[0]?.var).toBe("fromAcctNo");
  });

  it("removeExtractAndDependentInjects clears downstream injects from that source", () => {
    let bindings: StepBindingsByStepKey = {};
    bindings = upsertExtract(bindings, "a", "acctNo", "acctNo");
    bindings = upsertInject(bindings, "b", "acctNo", "targetAcct");
    const next = removeExtractAndDependentInjects(runSteps, bindings, 0, "acctNo");
    expect(next.a?.extracts).toHaveLength(0);
    expect(next.b?.injects).toHaveLength(0);
  });

  it("allocateUniqueExtractVarName always scopes by step index", () => {
    expect(
      allocateUniqueExtractVarName({
        responsePath: "custId",
        runSteps,
        bindings: {},
        sourceStepIndex: 0,
      }),
    ).toBe("custId_TC1");
    expect(
      allocateUniqueExtractVarName({
        responsePath: "acctNbr",
        runSteps,
        bindings: {},
        sourceStepIndex: 2,
        startVarKeys: ["acctNbr"],
      }),
    ).toBe("acctNbr_TC3");
  });

  it("allocateUniqueExtractVarName keeps TC2 when TC1 already extracted same leaf", () => {
    let bindings: StepBindingsByStepKey = {};
    bindings = upsertExtract(bindings, "a", "custId_TC1", "custId");
    const name = allocateUniqueExtractVarName({
      responsePath: "custId",
      runSteps,
      bindings,
      sourceStepIndex: 1,
    });
    expect(name).toBe("custId_TC2");
  });
});

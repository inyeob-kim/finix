import { describe, expect, it } from "vitest";
import {
  applyVarLink,
  buildBindingCanvasGraph,
  BINDING_CANVAS_START_ID,
  removeVarLink,
} from "@/lib/scenarioBindingCanvas";
import { START_VAR_STEP_INDEX } from "@/lib/scenarioConnectionUx";
import type { StepBindingsByStepKey } from "@/lib/scenarioBindings";
import type { ScenarioRunStep } from "@/lib/scenarioRunSequence";

function step(
  id: string,
  code: string,
  order: number,
): ScenarioRunStep {
  return {
    stepKey: id,
    order,
    title: `T-${code}`,
    serviceCode: code,
    serviceName: code,
  };
}

describe("scenarioBindingCanvas", () => {
  const runSteps = [step("a", "S1", 1), step("b", "S2", 2)];

  it("maps start + steps + end nodes", () => {
    const { nodes, edges } = buildBindingCanvasGraph(runSteps, {}, ["acctNo"]);
    expect(nodes.some((n) => n.id === BINDING_CANVAS_START_ID)).toBe(true);
    expect(nodes.filter((n) => n.kind === "step")).toHaveLength(2);
    expect(nodes.some((n) => n.kind === "end")).toBe(true);
    expect(edges).toHaveLength(0);
  });

  it("maps startVar inject as edge from Start", () => {
    const bindings: StepBindingsByStepKey = {
      b: {
        extracts: [],
        injects: [{ var: "acctNo", json_path: "$.acctNo" }],
        overrides: [],
      },
    };
    const { edges } = buildBindingCanvasGraph(runSteps, bindings, ["acctNo"]);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.fromNodeId).toBe(BINDING_CANVAS_START_ID);
    expect(edges[0]?.varName).toBe("acctNo");
    expect(edges[0]?.linked).toBe(true);
  });

  it("maps step extract→inject as linked var edge", () => {
    const bindings: StepBindingsByStepKey = {
      a: {
        extracts: [{ var: "txId", json_path: "$.txId" }],
        injects: [],
        overrides: [],
      },
      b: {
        extracts: [],
        injects: [{ var: "txId", json_path: "$.refTx" }],
        overrides: [],
      },
    };
    const { edges } = buildBindingCanvasGraph(runSteps, bindings, []);
    const varEdges = edges.filter((e) => e.kind === "var");
    expect(varEdges).toHaveLength(1);
    expect(varEdges[0]?.fromStepIndex).toBe(0);
    expect(varEdges[0]?.toStepIndex).toBe(1);
    expect(varEdges[0]?.linked).toBe(true);
  });

  it("adds dataModel node and override edges", () => {
    const bindings: StepBindingsByStepKey = {
      a: {
        extracts: [],
        injects: [],
        overrides: [{ json_path: "$.x", value: 1 }],
      },
    };
    const { nodes, edges } = buildBindingCanvasGraph(runSteps, bindings, []);
    expect(nodes.some((n) => n.kind === "dataModel")).toBe(true);
    expect(edges.some((e) => e.kind === "override")).toBe(true);
  });

  it("applyVarLink creates extract + inject", () => {
    const next = applyVarLink({}, runSteps, {
      fromStepIndex: 0,
      toStepIndex: 1,
      varName: "txId",
      responsePath: "txId",
      requestPath: "refTx",
    });
    expect(next.a?.extracts[0]?.var).toBe("txId");
    expect(next.b?.injects[0]?.var).toBe("txId");
  });

  it("applyVarLink from Start only injects", () => {
    const next = applyVarLink({}, runSteps, {
      fromStepIndex: START_VAR_STEP_INDEX,
      toStepIndex: 0,
      varName: "branchId",
      responsePath: "",
      requestPath: "branchId",
    });
    expect(next.a?.injects[0]?.var).toBe("branchId");
    expect(next.a?.extracts).toHaveLength(0);
  });

  it("removeVarLink clears inject", () => {
    let bindings = applyVarLink({}, runSteps, {
      fromStepIndex: 0,
      toStepIndex: 1,
      varName: "txId",
      responsePath: "txId",
      requestPath: "refTx",
    });
    bindings = removeVarLink(bindings, runSteps, {
      toStepIndex: 1,
      requestPath: "refTx",
      varName: "txId",
    });
    expect(bindings.b?.injects ?? []).toHaveLength(0);
    expect(bindings.a?.extracts[0]?.var).toBe("txId");
  });
});

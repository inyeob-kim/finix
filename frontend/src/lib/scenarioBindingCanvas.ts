/** Binding canvas view-model — maps step bindings to Start/Loop/End graph. */

import {
  emptyStepBinding,
  stripBindingPathForInput,
  upsertExtract,
  upsertInject,
  removeInjectByPath,
  removeInjectByVar,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
  START_VAR_STEP_INDEX,
  buildRuntimeConnectionLinks,
  fieldVarNameFromPath,
} from "@/lib/scenarioConnectionUx";
import {
  runStepCaseIdLabel,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";

export type BindingCanvasNodeKind = "start" | "step" | "end" | "dataModel";

export type BindingCanvasNode = {
  id: string;
  kind: BindingCanvasNodeKind;
  label: string;
  subtitle?: string;
  stepIndex?: number;
  stepKey?: string;
  overrideCount?: number;
};

export type BindingCanvasEdgeKind = "var" | "override";

export type BindingCanvasEdge = {
  id: string;
  kind: BindingCanvasEdgeKind;
  varName: string;
  fromNodeId: string;
  toNodeId: string;
  fromStepIndex: number;
  toStepIndex: number;
  responsePath: string;
  requestPath: string;
  linked: boolean;
};

export const BINDING_CANVAS_START_ID = "node:start";
export const BINDING_CANVAS_END_ID = "node:end";
export const BINDING_CANVAS_DATA_ID = "node:data";

export function bindingCanvasStepNodeId(stepIndex: number): string {
  return `node:step:${stepIndex}`;
}

export function bindingCanvasEdgeId(input: {
  kind: BindingCanvasEdgeKind;
  varName: string;
  fromStepIndex: number;
  toStepIndex: number;
  requestPath: string;
}): string {
  return [
    input.kind,
    input.fromStepIndex,
    input.toStepIndex,
    input.varName,
    stripBindingPathForInput(input.requestPath),
  ].join("|");
}

export function buildBindingCanvasGraph(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  startVarKeys: readonly string[] = [],
): { nodes: BindingCanvasNode[]; edges: BindingCanvasEdge[] } {
  const startVars = startVarKeys.map((k) => k.trim()).filter(Boolean);
  const nodes: BindingCanvasNode[] = [
    {
      id: BINDING_CANVAS_START_ID,
      kind: "start",
      label: "Start",
      subtitle:
        startVars.length > 0
          ? `컬렉션 변수 ${startVars.length}개`
          : "컬렉션 변수 없음",
    },
  ];

  let totalOverrides = 0;
  runSteps.forEach((step, stepIndex) => {
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    const overrideCount = cfg.overrides.length;
    totalOverrides += overrideCount;
    nodes.push({
      id: bindingCanvasStepNodeId(stepIndex),
      kind: "step",
      label: step.title,
      subtitle: runStepCaseIdLabel(step),
      stepIndex,
      stepKey: step.stepKey,
      overrideCount,
    });
  });

  if (totalOverrides > 0) {
    nodes.push({
      id: BINDING_CANVAS_DATA_ID,
      kind: "dataModel",
      label: "Data Model",
      subtitle: `고정값 ${totalOverrides}건`,
      overrideCount: totalOverrides,
    });
  }

  nodes.push({
    id: BINDING_CANVAS_END_ID,
    kind: "end",
    label: "End",
  });

  const links = buildRuntimeConnectionLinks(runSteps, bindings, startVarKeys);
  const edges: BindingCanvasEdge[] = links.map((link) => {
    const fromNodeId =
      link.fromStepIndex === START_VAR_STEP_INDEX
        ? BINDING_CANVAS_START_ID
        : link.fromStepIndex >= 0
          ? bindingCanvasStepNodeId(link.fromStepIndex)
          : BINDING_CANVAS_START_ID;
    return {
      id: bindingCanvasEdgeId({
        kind: "var",
        varName: link.var,
        fromStepIndex: link.fromStepIndex,
        toStepIndex: link.toStepIndex,
        requestPath: link.requestPath,
      }),
      kind: "var",
      varName: link.var,
      fromNodeId,
      toNodeId: bindingCanvasStepNodeId(link.toStepIndex),
      fromStepIndex: link.fromStepIndex,
      toStepIndex: link.toStepIndex,
      responsePath: link.responsePath,
      requestPath: link.requestPath,
      linked: link.linked,
    };
  });

  runSteps.forEach((step, stepIndex) => {
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    if (cfg.overrides.length === 0 || totalOverrides === 0) return;
    edges.push({
      id: bindingCanvasEdgeId({
        kind: "override",
        varName: "override",
        fromStepIndex: -1,
        toStepIndex: stepIndex,
        requestPath: `overrides:${step.stepKey}`,
      }),
      kind: "override",
      varName: "override",
      fromNodeId: BINDING_CANVAS_DATA_ID,
      toNodeId: bindingCanvasStepNodeId(stepIndex),
      fromStepIndex: -1,
      toStepIndex: stepIndex,
      responsePath: "",
      requestPath: "",
      linked: true,
    });
  });

  return { nodes, edges };
}

export type ApplyVarLinkInput = {
  fromStepIndex: number;
  toStepIndex: number;
  varName: string;
  responsePath: string;
  requestPath: string;
};

/** Create/update extract (if from a step) + inject on the target step. */
export function applyVarLink(
  bindings: StepBindingsByStepKey,
  runSteps: ScenarioRunStep[],
  input: ApplyVarLinkInput,
): StepBindingsByStepKey {
  const toStep = runSteps[input.toStepIndex];
  if (!toStep) return bindings;
  const varName = input.varName.trim() || fieldVarNameFromPath(input.requestPath);
  if (!varName || !input.requestPath.trim()) return bindings;

  let next = bindings;
  if (input.fromStepIndex === START_VAR_STEP_INDEX) {
    next = upsertInject(next, toStep.stepKey, varName, input.requestPath);
    return next;
  }

  const fromStep = runSteps[input.fromStepIndex];
  if (!fromStep) return bindings;
  if (!input.responsePath.trim()) return bindings;
  if (input.fromStepIndex >= input.toStepIndex) return bindings;

  next = upsertExtract(next, fromStep.stepKey, varName, input.responsePath);
  next = upsertInject(next, toStep.stepKey, varName, input.requestPath);
  return next;
}

/** Remove inject for an edge; leaves extract in place (may become saved-only). */
export function removeVarLink(
  bindings: StepBindingsByStepKey,
  runSteps: ScenarioRunStep[],
  edge: Pick<BindingCanvasEdge, "toStepIndex" | "requestPath" | "varName">,
): StepBindingsByStepKey {
  const toStep = runSteps[edge.toStepIndex];
  if (!toStep) return bindings;
  let next = removeInjectByPath(bindings, toStep.stepKey, edge.requestPath);
  const v = edge.varName.trim();
  if (v) next = removeInjectByVar(next, toStep.stepKey, v);
  return next;
}

/** Binding canvas view-model — maps step bindings to Start/Loop/End graph. */

import {
  stripBindingPathForInput,
  upsertInject,
  removeInjectByPath,
  removeInjectByVar,
  setExtractVarAtPath,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
  START_VAR_STEP_INDEX,
  buildRuntimeConnectionLinks,
  fieldVarNameFromPath,
} from "@/lib/scenarioConnectionUx";
import { allocateUniqueExtractVarName } from "@/lib/extractVarNaming";
import {
  runStepCaseIdLabel,
  runStepShortDescription,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";
import { formatPinFlowLabel } from "@/lib/poolCaseLiveRef";

export type BindingCanvasNodeKind = "start" | "step" | "end";

export type BindingCanvasNode = {
  id: string;
  kind: BindingCanvasNodeKind;
  label: string;
  subtitle?: string;
  /** Pinned TC hist label for header trailing edge (`v2`). */
  versionLabel?: string;
  stepIndex?: number;
  stepKey?: string;
};

export type BindingCanvasEdgeKind = "var";

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

  runSteps.forEach((step, stepIndex) => {
    const desc =
      runStepShortDescription(step) ||
      step.title?.trim() ||
      step.serviceCode;
    const pinMeta = formatPinFlowLabel(step.tcHistVersion);
    nodes.push({
      id: bindingCanvasStepNodeId(stepIndex),
      kind: "step",
      // Header: short case id (avoids truncating long titles on the blue bar).
      label: runStepCaseIdLabel(step),
      // Body: human-readable test title.
      subtitle: desc,
      versionLabel: pinMeta,
      stepIndex,
      stepKey: step.stepKey,
    });
  });

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
  if (!input.requestPath.trim()) return bindings;

  let next = bindings;
  if (input.fromStepIndex === START_VAR_STEP_INDEX) {
    const startVar =
      input.varName.trim() || fieldVarNameFromPath(input.requestPath);
    if (!startVar) return bindings;
    next = upsertInject(next, toStep.stepKey, startVar, input.requestPath);
    return next;
  }

  const fromStep = runSteps[input.fromStepIndex];
  if (!fromStep) return bindings;
  if (!input.responsePath.trim()) return bindings;
  if (input.fromStepIndex >= input.toStepIndex) return bindings;

  const varName = allocateUniqueExtractVarName({
    responsePath: input.responsePath,
    preferredName:
      input.varName.trim() || fieldVarNameFromPath(input.responsePath),
    runSteps,
    bindings,
    sourceStepIndex: input.fromStepIndex,
    exceptResponsePath: input.responsePath,
  });
  if (!varName) return bindings;

  next = setExtractVarAtPath(next, fromStep.stepKey, input.responsePath, varName);
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

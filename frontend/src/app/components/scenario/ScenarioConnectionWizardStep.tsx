import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { ScenarioRuleTestcaseRef } from "../scenarioRegistry/types";
import {
  buildScenarioStepsWithBindings,
  emptyStepBinding,
  stripBindingPathForInput,
  removeInjectByPath,
  removeInjectByVar,
  upsertExtract,
  upsertInject,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
  buildVariableFlowLanes,
  fieldVarNameFromPath,
} from "@/lib/scenarioConnectionUx";
import {
  removeExtractAndDependentInjects,
  renameExtractVarInScenario,
} from "@/lib/extractVarNaming";
import {
  buildPerStepFromRunSteps,
  buildRunStepsFromPicks,
  serviceNameMapFromDrafts,
} from "@/lib/scenarioRunSequence";
import {
  buildRuntimeFlowExceptions,
  type RuntimeFlowException,
} from "@/lib/scenarioRuntimeContext";
import { useScenarioFlowPreview } from "@/hooks/useScenarioFlowPreview";
import { ScenarioRuntimeTimeline } from "./ScenarioRuntimeTimeline";
import { ScenarioFlowExceptionsPanel } from "./ScenarioFlowExceptionsPanel";
import { ScenarioExecutionValuesCollapsible } from "./ScenarioExecutionValuesCollapsible";
import { ScenarioVariableFlowStrip } from "./ScenarioVariableFlowStrip";
import { ScenarioCollectionVarsSummary } from "./ScenarioCollectionVarsSummary";
import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import { startVarKeysFromConfig } from "@/lib/scenarioPostmanVariables";

type Props = {
  selectedRuleTestcases: ScenarioRuleTestcaseRef[];
  serviceDrafts: Array<{ code: string; name: string }>;
  bindings: StepBindingsByStepKey;
  onBindingsChange: Dispatch<SetStateAction<StepBindingsByStepKey>>;
  postmanConfig: ScenarioPostmanConfig;
  onOpenCollectionVars: () => void;
};

function suggestedFocusStepIndex(
  runSteps: ReturnType<typeof buildRunStepsFromPicks>,
  bindings: StepBindingsByStepKey,
): number | null {
  if (runSteps.length === 0) return null;
  const lanes = buildVariableFlowLanes(runSteps, bindings);
  if (lanes.length === 0) return 0;
  for (const lane of lanes) {
    if (lane.hops.length === 0 && lane.fromStepIndex >= 0) {
      return lane.fromStepIndex;
    }
    const broken = lane.hops.find((h) => !h.linked);
    if (broken) return broken.toStepIndex;
  }
  return null;
}

export function ScenarioConnectionWizardStep({
  selectedRuleTestcases,
  serviceDrafts,
  bindings,
  onBindingsChange,
  postmanConfig,
  onOpenCollectionVars,
}: Props) {
  const [focusStepIndex, setFocusStepIndex] = useState<number | null>(null);
  const startVarKeys = useMemo(
    () => startVarKeysFromConfig(postmanConfig),
    [postmanConfig],
  );

  const runSteps = useMemo(
    () =>
      buildRunStepsFromPicks(
        selectedRuleTestcases,
        serviceNameMapFromDrafts(serviceDrafts),
      ),
    [selectedRuleTestcases, serviceDrafts],
  );

  const perStep = useMemo(
    () => buildPerStepFromRunSteps(runSteps),
    [runSteps],
  );

  const apiSteps = useMemo(
    () =>
      buildScenarioStepsWithBindings(
        runSteps.map((s) => ({
          stepKey: s.stepKey,
          code: s.serviceCode,
          name: s.serviceName,
          title: s.title,
        })),
        bindings,
      ),
    [runSteps, bindings],
  );

  const flowExceptions = useMemo(
    () => buildRuntimeFlowExceptions(runSteps, bindings, startVarKeys),
    [runSteps, bindings, startVarKeys],
  );

  const hintStepIndex = useMemo(
    () => suggestedFocusStepIndex(runSteps, bindings),
    [runSteps, bindings],
  );

  const { preview, loading: previewLoading } = useScenarioFlowPreview(
    apiSteps,
    perStep,
    runSteps.length >= 1,
  );

  const handleInjectReuse = (
    stepIndex: number,
    requestPath: string,
    runtimeVar: string,
  ) => {
    const step = runSteps[stepIndex];
    if (!step) return;
    onBindingsChange((prev) =>
      upsertInject(prev, step.stepKey, runtimeVar, requestPath),
    );
  };

  const handleDefineExtract = (
    sourceStepIndex: number,
    responsePath: string,
    varName?: string,
  ) => {
    const step = runSteps[sourceStepIndex];
    if (!step) return;
    const name = (varName ?? fieldVarNameFromPath(responsePath)).trim();
    if (!name) return;
    onBindingsChange((prev) =>
      upsertExtract(prev, step.stepKey, name, responsePath),
    );
  };

  const handleRenameExtract = (
    sourceStepIndex: number,
    responsePath: string,
    newVarName: string,
  ) => {
    onBindingsChange((prev) =>
      renameExtractVarInScenario(
        runSteps,
        prev,
        sourceStepIndex,
        responsePath,
        newVarName,
      ),
    );
  };

  const handleDisconnectInject = (
    stepIndex: number,
    requestPath: string,
    runtimeVar?: string,
  ) => {
    const step = runSteps[stepIndex];
    if (!step) return;
    onBindingsChange((prev) => {
      let next = removeInjectByPath(prev, step.stepKey, requestPath);
      const v = runtimeVar?.trim();
      if (v) next = removeInjectByVar(next, step.stepKey, v);
      return next;
    });
  };

  const handleDisconnectExtract = (
    sourceStepIndex: number,
    responsePath: string,
  ) => {
    onBindingsChange((prev) =>
      removeExtractAndDependentInjects(
        runSteps,
        prev,
        sourceStepIndex,
        responsePath,
      ),
    );
  };

  const handleApplyRecovery = (ex: RuntimeFlowException) => {
    const fromStep = runSteps[ex.recoveryFromStepIndex];
    const toStep = runSteps[ex.stepIndex];
    if (!fromStep || !toStep) return;
    onBindingsChange((prev) => {
      const fromCfg = prev[fromStep.stepKey] ?? emptyStepBinding();
      const extract =
        fromCfg.extracts.find((e) => e.var.trim() === ex.recoveryVar) ??
        fromCfg.extracts[0];
      if (!extract) return prev;
      const path = stripBindingPathForInput(extract.json_path);
      return upsertInject(prev, toStep.stepKey, ex.recoveryVar, path);
    });
  };

  if (runSteps.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      <p className="text-[11px] text-muted-foreground shrink-0 px-0.5">
        {runSteps.length >= 2
          ? "컬렉션 변수 또는 1번 ↑ 응답 → 이후 ↓ 요청 연결"
          : "컬렉션 변수·body 고정값으로 요청 구성"}
      </p>
      <ScenarioCollectionVarsSummary
        config={postmanConfig}
        onManage={onOpenCollectionVars}
      />
      <ScenarioVariableFlowStrip
        runSteps={runSteps}
        bindings={bindings}
        startVarKeys={startVarKeys}
        onBindingsChange={onBindingsChange}
        onFocusStep={setFocusStepIndex}
      />
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-0.5 px-0.5 pb-4 space-y-2">
        <ScenarioRuntimeTimeline
          runSteps={runSteps}
          bindings={bindings}
          startVarKeys={startVarKeys}
          focusStepIndex={focusStepIndex}
          hintStepIndex={hintStepIndex}
          onInjectReuse={handleInjectReuse}
          onDisconnectInject={handleDisconnectInject}
          onDefineExtract={handleDefineExtract}
          onRenameExtract={(sourceStepIndex, responsePath, newVar) => {
            handleRenameExtract(sourceStepIndex, responsePath, newVar);
            setFocusStepIndex(null);
          }}
          onDisconnectExtract={handleDisconnectExtract}
        />

        {runSteps.length >= 2 ? (
          <ScenarioFlowExceptionsPanel
            exceptions={flowExceptions}
            onApplyRecovery={handleApplyRecovery}
            onFocusStep={setFocusStepIndex}
          />
        ) : null}

        <ScenarioExecutionValuesCollapsible
          runSteps={runSteps}
          bindings={bindings}
          onBindingsChange={onBindingsChange}
          preview={preview}
          previewLoading={previewLoading}
        />
      </div>
    </div>
  );
}

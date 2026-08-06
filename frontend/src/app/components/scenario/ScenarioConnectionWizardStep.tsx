import { useEffect, useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { ScenarioRuleTestcaseRef } from "../scenarioRegistry/types";
import {
  buildScenarioStepsWithBindings,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import type { BindingCanvasEdge } from "@/lib/scenarioBindingCanvas";
import {
  buildPerStepFromRunSteps,
  buildRunStepsFromPicks,
  serviceNameMapFromDrafts,
} from "@/lib/scenarioRunSequence";
import { useScenarioFlowPreview } from "@/hooks/useScenarioFlowPreview";
import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import {
  removeCustomStartVar,
  startVarKeysForBodyChips,
  startVarKeysFromConfig,
  upsertCustomStartVar,
} from "@/lib/scenarioPostmanVariables";
import { ScenarioBindingCanvas } from "./bindingCanvas/ScenarioBindingCanvas";
import {
  ScenarioStepPostmanPanel,
  type ScenarioStepPostmanPanelHandle,
} from "./ScenarioStepPostmanPanel";

type Props = {
  selectedRuleTestcases: ScenarioRuleTestcaseRef[];
  serviceDrafts: Array<{ code: string; name: string }>;
  bindings: StepBindingsByStepKey;
  onBindingsChange: Dispatch<SetStateAction<StepBindingsByStepKey>>;
  postmanConfig: ScenarioPostmanConfig;
  onPostmanConfigChange: (next: ScenarioPostmanConfig) => void;
  onOpenCollectionVars: () => void;
  bodyFlushRef?: RefObject<ScenarioStepPostmanPanelHandle | null>;
};

export function ScenarioConnectionWizardStep({
  selectedRuleTestcases,
  serviceDrafts,
  bindings,
  onBindingsChange,
  postmanConfig,
  onPostmanConfigChange,
  onOpenCollectionVars,
  bodyFlushRef,
}: Props) {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);

  const startVarKeys = useMemo(
    () => startVarKeysFromConfig(postmanConfig),
    [postmanConfig],
  );
  const bodyStartVarKeys = useMemo(
    () => startVarKeysForBodyChips(postmanConfig),
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

  useEffect(() => {
    if (runSteps.length === 0) return;
    setSelectedStepIndex((prev) =>
      Math.min(Math.max(0, prev), runSteps.length - 1),
    );
  }, [runSteps.length]);

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
          ruleId: s.ruleId,
        })),
        bindings,
      ),
    [runSteps, bindings],
  );

  const { preview, loading: previewLoading } = useScenarioFlowPreview(
    apiSteps,
    perStep,
    runSteps.length >= 1,
  );

  const selectStep = (idx: number) => {
    setSelectedStepIndex(idx);
    setSelectedEdgeId(null);
  };

  const openEdgeTarget = (edge: BindingCanvasEdge) => {
    if (edge.toStepIndex >= 0) {
      setSelectedStepIndex(edge.toStepIndex);
      setSelectedEdgeId(edge.kind === "var" ? edge.id : null);
    }
  };

  if (runSteps.length === 0) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ScenarioBindingCanvas
            runSteps={runSteps}
            bindings={bindings}
            startVarKeys={startVarKeys}
            selectedEdgeId={selectedEdgeId}
            selectedStepIndex={selectedStepIndex}
            onSelectEdge={openEdgeTarget}
            onOpenCollectionVars={onOpenCollectionVars}
            onSelectStep={selectStep}
          />
        </div>
        <ScenarioStepPostmanPanel
          ref={bodyFlushRef}
          runSteps={runSteps}
          stepIndex={selectedStepIndex}
          bindings={bindings}
          onBindingsChange={onBindingsChange}
          startVarKeys={bodyStartVarKeys}
          collectionVars={postmanConfig.startVars}
          preview={preview}
          previewLoading={previewLoading}
          onAddCustomVar={(payload) => {
            onPostmanConfigChange(
              upsertCustomStartVar(postmanConfig, payload.key, {
                value: payload.value,
                generator: payload.generator,
              }),
            );
          }}
          onRemoveCustomVar={(key) => {
            onPostmanConfigChange(removeCustomStartVar(postmanConfig, key));
          }}
        />
      </div>
    </div>
  );
}

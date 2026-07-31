import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { ScenarioRuleTestcaseRef } from "../scenarioRegistry/types";
import {
  buildScenarioStepsWithBindings,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
  applyVarLink,
  removeVarLink,
  type BindingCanvasEdge,
} from "@/lib/scenarioBindingCanvas";
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
import { ScenarioBindingLinkDrawer } from "./bindingCanvas/ScenarioBindingLinkDrawer";
import { ScenarioStepPostmanPanel } from "./ScenarioStepPostmanPanel";
import { cn } from "../ui/utils";

type Props = {
  selectedRuleTestcases: ScenarioRuleTestcaseRef[];
  serviceDrafts: Array<{ code: string; name: string }>;
  bindings: StepBindingsByStepKey;
  onBindingsChange: Dispatch<SetStateAction<StepBindingsByStepKey>>;
  postmanConfig: ScenarioPostmanConfig;
  onPostmanConfigChange: (next: ScenarioPostmanConfig) => void;
  onOpenCollectionVars: () => void;
};

export function ScenarioConnectionWizardStep({
  selectedRuleTestcases,
  serviceDrafts,
  bindings,
  onBindingsChange,
  postmanConfig,
  onPostmanConfigChange,
  onOpenCollectionVars,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEdge, setEditingEdge] = useState<BindingCanvasEdge | null>(null);
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

  const openEditEdge = (edge: BindingCanvasEdge) => {
    if (edge.kind !== "var") {
      if (edge.toStepIndex >= 0) setSelectedStepIndex(edge.toStepIndex);
      setDrawerOpen(false);
      return;
    }
    setEditingEdge(edge);
    setSelectedEdgeId(edge.id);
    setSelectedStepIndex(edge.toStepIndex);
    setDrawerOpen(true);
  };

  const handleApplyLink = (draft: {
    fromStepIndex: number;
    toStepIndex: number;
    varName: string;
    responsePath: string;
    requestPath: string;
  }) => {
    onBindingsChange((prev) => {
      let next = prev;
      if (editingEdge) {
        next = removeVarLink(next, runSteps, editingEdge);
      }
      return applyVarLink(next, runSteps, {
        fromStepIndex: draft.fromStepIndex,
        toStepIndex: draft.toStepIndex,
        varName: draft.varName,
        responsePath: draft.responsePath,
        requestPath: draft.requestPath,
      });
    });
    setDrawerOpen(false);
    setEditingEdge(null);
    setSelectedEdgeId(null);
    setSelectedStepIndex(draft.toStepIndex);
  };

  const handleDeleteLink = () => {
    if (!editingEdge) return;
    onBindingsChange((prev) => removeVarLink(prev, runSteps, editingEdge));
    setDrawerOpen(false);
    setEditingEdge(null);
    setSelectedEdgeId(null);
  };

  if (runSteps.length === 0) {
    return null;
  }

  const showRight = drawerOpen || selectedStepIndex >= 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "flex min-h-0 flex-1 overflow-hidden rounded-md border border-border",
          showRight ? "flex-col lg:flex-row" : "flex-col",
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ScenarioBindingCanvas
            runSteps={runSteps}
            bindings={bindings}
            startVarKeys={startVarKeys}
            selectedEdgeId={selectedEdgeId}
            selectedStepIndex={selectedStepIndex}
            onSelectEdge={openEditEdge}
            onOpenCollectionVars={onOpenCollectionVars}
            onOpenOverrides={(stepIndex) => {
              if (typeof stepIndex === "number") {
                setSelectedStepIndex(stepIndex);
              }
              setDrawerOpen(false);
            }}
            onSelectStep={(idx) => {
              setSelectedStepIndex(idx);
              setDrawerOpen(false);
              setEditingEdge(null);
              setSelectedEdgeId(null);
            }}
          />
        </div>
        {drawerOpen && editingEdge ? (
          <ScenarioBindingLinkDrawer
            open={drawerOpen}
            runSteps={runSteps}
            startVarKeys={startVarKeys}
            initial={{
              fromStepIndex: editingEdge.fromStepIndex,
              toStepIndex: editingEdge.toStepIndex,
              varName: editingEdge.varName,
              responsePath: editingEdge.responsePath,
              requestPath: editingEdge.requestPath,
            }}
            editingEdge={editingEdge}
            onClose={() => {
              setDrawerOpen(false);
              setEditingEdge(null);
              setSelectedEdgeId(null);
            }}
            onApply={handleApplyLink}
            onDelete={handleDeleteLink}
          />
        ) : (
          <ScenarioStepPostmanPanel
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
        )}
      </div>
    </div>
  );
}

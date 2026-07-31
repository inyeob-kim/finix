import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { ScenarioRuleTestcaseRef } from "../scenarioRegistry/types";
import {
  buildScenarioStepsWithBindings,
  emptyStepBinding,
  stripBindingPathForInput,
  upsertInject,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
  applyVarLink,
  removeVarLink,
  type BindingCanvasEdge,
} from "@/lib/scenarioBindingCanvas";
import { START_VAR_STEP_INDEX } from "@/lib/scenarioConnectionUx";
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
import { ScenarioFlowExceptionsPanel } from "./ScenarioFlowExceptionsPanel";
import { ScenarioExecutionValuesCollapsible } from "./ScenarioExecutionValuesCollapsible";
import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import { startVarKeysFromConfig } from "@/lib/scenarioPostmanVariables";
import { ScenarioBindingCanvas } from "./bindingCanvas/ScenarioBindingCanvas";
import {
  ScenarioBindingLinkDrawer,
  type LinkDraft,
} from "./bindingCanvas/ScenarioBindingLinkDrawer";
import { cn } from "../ui/utils";

type Props = {
  selectedRuleTestcases: ScenarioRuleTestcaseRef[];
  serviceDrafts: Array<{ code: string; name: string }>;
  bindings: StepBindingsByStepKey;
  onBindingsChange: Dispatch<SetStateAction<StepBindingsByStepKey>>;
  postmanConfig: ScenarioPostmanConfig;
  onOpenCollectionVars: () => void;
};

export function ScenarioConnectionWizardStep({
  selectedRuleTestcases,
  serviceDrafts,
  bindings,
  onBindingsChange,
  postmanConfig,
  onOpenCollectionVars,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEdge, setEditingEdge] = useState<BindingCanvasEdge | null>(null);
  const [linkSeed, setLinkSeed] = useState<Partial<LinkDraft> | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [overridesOpen, setOverridesOpen] = useState(false);

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

  const { preview, loading: previewLoading } = useScenarioFlowPreview(
    apiSteps,
    perStep,
    runSteps.length >= 1,
  );

  const openAddLink = (seed?: {
    fromStepIndex?: number;
    toStepIndex?: number;
  }) => {
    setEditingEdge(null);
    setSelectedEdgeId(null);
    setLinkSeed({
      fromStepIndex: seed?.fromStepIndex,
      toStepIndex: seed?.toStepIndex,
    });
    setDrawerOpen(true);
  };

  const openEditEdge = (edge: BindingCanvasEdge) => {
    if (edge.kind !== "var") {
      setOverridesOpen(true);
      return;
    }
    setEditingEdge(edge);
    setSelectedEdgeId(edge.id);
    setLinkSeed(null);
    setDrawerOpen(true);
  };

  const handleApplyLink = (draft: LinkDraft) => {
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
  };

  const handleDeleteLink = () => {
    if (!editingEdge) return;
    onBindingsChange((prev) => removeVarLink(prev, runSteps, editingEdge));
    setDrawerOpen(false);
    setEditingEdge(null);
    setSelectedEdgeId(null);
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
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div
        className={cn(
          "flex min-h-0 flex-1 overflow-hidden rounded-md border border-border",
          drawerOpen ? "flex-col lg:flex-row" : "flex-col",
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
            onAddLink={openAddLink}
            onOpenCollectionVars={onOpenCollectionVars}
            onOpenOverrides={() => setOverridesOpen(true)}
            onSelectStep={setSelectedStepIndex}
          />
        </div>
        {drawerOpen ? (
          <ScenarioBindingLinkDrawer
            open={drawerOpen}
            runSteps={runSteps}
            startVarKeys={startVarKeys}
            initial={
              linkSeed ??
              (editingEdge
                ? {
                    fromStepIndex: editingEdge.fromStepIndex,
                    toStepIndex: editingEdge.toStepIndex,
                    varName: editingEdge.varName,
                    responsePath: editingEdge.responsePath,
                    requestPath: editingEdge.requestPath,
                  }
                : {
                    fromStepIndex:
                      startVarKeys.length > 0 ? START_VAR_STEP_INDEX : 0,
                    toStepIndex: Math.min(1, runSteps.length - 1),
                  })
            }
            editingEdge={editingEdge}
            onClose={() => {
              setDrawerOpen(false);
              setEditingEdge(null);
              setSelectedEdgeId(null);
            }}
            onApply={handleApplyLink}
            onDelete={editingEdge ? handleDeleteLink : undefined}
          />
        ) : null}
      </div>

      <div className="shrink-0 space-y-2 overflow-y-auto max-h-[30%]">
        {runSteps.length >= 2 ? (
          <ScenarioFlowExceptionsPanel
            exceptions={flowExceptions}
            onApplyRecovery={handleApplyRecovery}
            onFocusStep={(idx) => {
              setSelectedStepIndex(idx);
              openAddLink({ toStepIndex: idx });
            }}
          />
        ) : null}

        <ScenarioExecutionValuesCollapsible
          runSteps={runSteps}
          bindings={bindings}
          onBindingsChange={onBindingsChange}
          preview={preview}
          previewLoading={previewLoading}
          defaultOpen={overridesOpen}
        />
      </div>
    </div>
  );
}

import { useState } from "react";
import type { ScenarioResolvePreviewDto } from "@/api/types";
import {
  stripBindingPathForInput,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import { fieldVarNameFromPath } from "@/lib/scenarioConnectionUx";
import {
  runStepCaseIdLabel,
  runStepHeadline,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";
import { ScenarioDataFlowStrip } from "./ScenarioDataFlowStrip";
import { ScenarioExecutionValuesJsonEditor } from "./ScenarioExecutionValuesJsonEditor";

type Props = {
  runSteps: ScenarioRunStep[];
  bindings: StepBindingsByStepKey;
  onBindingsChange: (next: StepBindingsByStepKey) => void;
  preview: ScenarioResolvePreviewDto | null;
  previewLoading?: boolean;
};

export function ScenarioExecutionValuesPanel({
  runSteps,
  bindings,
  onBindingsChange,
  preview,
  previewLoading = false,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  const safeIndex = Math.min(activeIndex, Math.max(0, runSteps.length - 1));
  const step = runSteps[safeIndex];
  const cfg = step ? bindings[step.stepKey] : undefined;
  const overrides = cfg?.overrides ?? [];

  const previewRow = preview?.steps?.[safeIndex];
  const templateBody =
    previewRow?.template_request_body &&
    typeof previewRow.template_request_body === "object"
      ? previewRow.template_request_body
      : null;
  const resolvedBody =
    previewRow?.resolved_request_body &&
    typeof previewRow.resolved_request_body === "object"
      ? previewRow.resolved_request_body
      : null;

  if (runSteps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground rounded-sm border border-dashed px-3 py-4">
        1단계에서 테스트 케이스를 선택하면 실행 값을 설정할 수 있습니다.
      </p>
    );
  }

  if (!step) return null;

  return (
    <div className="flex flex-col gap-3 min-h-0 pb-2">
      <ScenarioDataFlowStrip
        runSteps={runSteps}
        bindings={bindings}
        activeIndex={safeIndex}
        onSelectStep={setActiveIndex}
      />

      <div className="rounded-sm border border-border bg-card px-3 py-2.5 space-y-2">
        <p className="text-xs font-medium text-foreground">
          <span className="text-muted-foreground tabular-nums mr-1">
            [{safeIndex + 1}]
          </span>
          <span className="font-mono text-primary">{runStepHeadline(step)}</span>
        </p>
        <p className="text-[10px] text-muted-foreground font-mono">
          {runStepCaseIdLabel(step)}
        </p>
        {overrides.length > 0 ? (
          <p className="text-[10px] text-muted-foreground font-mono">
            {overrides
              .map((r) => fieldVarNameFromPath(stripBindingPathForInput(r.json_path)))
              .join(" · ")}
          </p>
        ) : null}
      </div>

      <ScenarioExecutionValuesJsonEditor
        stepKey={step.stepKey}
        templateBody={templateBody}
        overrides={overrides}
        bindings={bindings}
        onBindingsChange={onBindingsChange}
        resolvedPreview={resolvedBody}
        previewLoading={previewLoading}
      />
    </div>
  );
}

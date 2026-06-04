import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import {
  availableInjectVariables,
  buildRuntimeVariableCatalog,
} from "@/lib/scenarioConnectionUx";
import { runStepHeadline, type ScenarioRunStep } from "@/lib/scenarioRunSequence";
import type { StepBindingsByStepKey } from "@/lib/scenarioBindings";
import { ScenarioStepInlineConnector } from "./ScenarioStepInlineConnector";
import { ScenarioWizardSectionCard } from "./ScenarioWizardSectionCard";
import { cn } from "../ui/utils";

type Props = {
  runSteps: ScenarioRunStep[];
  bindings: StepBindingsByStepKey;
  startVarKeys?: string[];
  focusStepIndex?: number | null;
  hintStepIndex?: number | null;
  onInjectReuse: (stepIndex: number, requestPath: string, runtimeVar: string) => void;
  onDisconnectInject: (
    stepIndex: number,
    requestPath: string,
    runtimeVar?: string,
  ) => void;
  onDefineExtract: (
    sourceStepIndex: number,
    responsePath: string,
    varName?: string,
  ) => void;
  onRenameExtract: (
    sourceStepIndex: number,
    responsePath: string,
    newVarName: string,
  ) => void;
  onDisconnectExtract: (sourceStepIndex: number, responsePath: string) => void;
};

function varsForStep(
  catalog: ReturnType<typeof buildRuntimeVariableCatalog>,
  stepIndex: number,
) {
  const generates = catalog
    .filter((v) => v.generatedAtStepIndex === stepIndex)
    .map((v) => v.var);
  const uses = catalog
    .filter((v) => v.usedAtStepIndexes.includes(stepIndex))
    .map((v) => v.var);
  return { generates, uses };
}

export function ScenarioRuntimeTimeline({
  runSteps,
  bindings,
  startVarKeys = [],
  focusStepIndex,
  hintStepIndex,
  onInjectReuse,
  onDisconnectInject,
  onDefineExtract,
  onRenameExtract,
  onDisconnectExtract,
}: Props) {
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);

  useEffect(() => {
    if (focusStepIndex != null) {
      setExpandedStepIndex(focusStepIndex);
    }
  }, [focusStepIndex]);

  const variableCatalog = useMemo(
    () => buildRuntimeVariableCatalog(runSteps, bindings),
    [runSteps, bindings],
  );

  const toggleConnect = (idx: number) => {
    setExpandedStepIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <ScenarioWizardSectionCard
      title="단계별 연결"
      hint="↑ 응답 · ↓ 요청 · 초록=연결됨"
      bodyClassName="px-2 py-2 overflow-y-auto max-h-[min(48vh,420px)]"
    >
        {runSteps.map((step, idx) => {
          const { generates, uses } = varsForStep(variableCatalog, idx);
          const expanded = expandedStepIndex === idx;
          const canInject = idx > 0 || startVarKeys.length > 0;
          const injectVars = availableInjectVariables(
            variableCatalog,
            idx,
            startVarKeys,
          );
          const injectReady = injectVars.length > 0;
          const hinted = hintStepIndex === idx && !expanded;
          const stepHasBindings =
            (bindings[step.stepKey]?.extracts.length ?? 0) > 0 ||
            (bindings[step.stepKey]?.injects.length ?? 0) > 0;

          return (
            <div key={step.stepKey}>
              <div
                className={cn(
                  "rounded-sm px-2 py-2 transition-colors",
                  expanded && "bg-muted/30",
                  hinted && "ring-1 ring-primary/40 bg-primary/[0.04]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground line-clamp-2">
                      <span className="text-muted-foreground tabular-nums mr-1">
                        [{idx + 1}]
                      </span>
                      <span className="font-mono text-primary">
                        {runStepHeadline(step)}
                      </span>
                    </p>
                    {(uses.length > 0 || generates.length > 0) && (
                      <p className="text-[10px] mt-0.5 font-mono truncate">
                        {generates.length > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            ↑ {generates.join(" ")}
                          </span>
                        ) : null}
                        {generates.length > 0 && uses.length > 0 ? " · " : null}
                        {uses.length > 0 ? (
                          <span className="text-foreground/80">
                            ↓ {uses.join(" ")}
                          </span>
                        ) : null}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className={cn(
                      "shrink-0 h-7 px-2 rounded-sm border text-[10px] font-medium",
                      "inline-flex items-center justify-center gap-1 transition-colors",
                      expanded
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-primary/10 hover:border-primary/40",
                      hinted && !expanded && "ring-1 ring-primary/40",
                    )}
                    onClick={() => toggleConnect(idx)}
                  >
                    {canInject ? (
                      <>
                        <ArrowDownToLine className="w-3 h-3" />
                        넣기
                      </>
                    ) : (
                      <>
                        <ArrowUpFromLine className="w-3 h-3" />
                        만들기
                      </>
                    )}
                  </button>
                </div>

                {expanded ? (
                  <ScenarioStepInlineConnector
                    stepIndex={idx}
                    runSteps={runSteps}
                    bindings={bindings}
                    variableCatalog={variableCatalog}
                    startVarKeys={startVarKeys}
                    injectReady={injectReady}
                    onInjectReuse={(req, v) => onInjectReuse(idx, req, v)}
                    onDisconnectInject={(req, v) =>
                      onDisconnectInject(idx, req, v)
                    }
                    onDefineExtract={onDefineExtract}
                    onRenameExtract={onRenameExtract}
                    onDisconnectExtract={onDisconnectExtract}
                    onClose={() => setExpandedStepIndex(null)}
                  />
                ) : null}
              </div>

              {idx < runSteps.length - 1 ? (
                <div className="flex justify-center py-0.5 text-muted-foreground/30">
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>
              ) : null}
            </div>
          );
        })}
    </ScenarioWizardSectionCard>
  );
}

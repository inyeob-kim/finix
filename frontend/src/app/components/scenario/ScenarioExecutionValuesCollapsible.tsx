import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ScenarioResolvePreviewDto } from "@/api/types";
import type { StepBindingsByStepKey } from "@/lib/scenarioBindings";
import type { ScenarioRunStep } from "@/lib/scenarioRunSequence";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { ScenarioExecutionValuesPanel } from "./ScenarioExecutionValuesPanel";
import { cn } from "../ui/utils";

type Props = {
  runSteps: ScenarioRunStep[];
  bindings: StepBindingsByStepKey;
  onBindingsChange: (next: StepBindingsByStepKey) => void;
  preview: ScenarioResolvePreviewDto | null;
  previewLoading?: boolean;
  defaultOpen?: boolean;
};

export function ScenarioExecutionValuesCollapsible({
  runSteps,
  bindings,
  onBindingsChange,
  preview,
  previewLoading,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  const overrideCount = runSteps.reduce((n, s) => {
    const cfg = bindings[s.stepKey];
    return n + (cfg?.overrides?.length ?? 0);
  }, 0);

  if (runSteps.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="shrink-0">
      <CollapsibleTrigger
        type="button"
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-sm border border-border",
          "px-3 py-2 text-xs font-medium hover:bg-muted/40 transition-colors",
        )}
      >
        <span className="text-left">
          body 고정값
          <span className="block text-[10px] font-normal text-muted-foreground">
            템플릿과 다른 필드만 고정
          </span>
        </span>
        <span className="flex items-center gap-2 text-muted-foreground font-normal">
          {overrideCount > 0 ? (
            <span className="tabular-nums">{overrideCount}</span>
          ) : null}
          <ChevronDown
            className={cn("w-4 h-4 transition-transform", open && "rotate-180")}
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <ScenarioExecutionValuesPanel
          runSteps={runSteps}
          bindings={bindings}
          onBindingsChange={onBindingsChange}
          preview={preview}
          previewLoading={previewLoading}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

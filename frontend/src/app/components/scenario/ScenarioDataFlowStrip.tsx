import { ArrowRight } from "lucide-react";
import type { StepBindingsByStepKey } from "@/lib/scenarioBindings";
import {
  runStepCaseIdLabel,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";

type Props = {
  runSteps: ScenarioRunStep[];
  bindings: StepBindingsByStepKey;
  activeIndex: number;
  onSelectStep: (index: number) => void;
};

export function ScenarioDataFlowStrip({
  runSteps,
  bindings,
  activeIndex,
  onSelectStep,
}: Props) {
  if (runSteps.length === 0) return null;

  return (
    <div className="rounded-sm border border-border bg-card/60 px-3 py-3">
      <p className="text-[11px] text-muted-foreground mb-2">
        테스트 케이스 실행 순서 · 단계를 클릭해 연결 설정
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {runSteps.map((step, idx) => {
          const cfg = bindings[step.stepKey];
          const extractCount =
            cfg?.extracts?.filter((r) => r.var.trim()).length ?? 0;
          const injectCount =
            cfg?.injects?.filter((r) => r.var.trim()).length ?? 0;
          const overrideCount =
            cfg?.overrides?.filter((r) => r.json_path.trim()).length ?? 0;
          const badge =
            extractCount + injectCount + overrideCount > 0
              ? [
                  injectCount > 0 ? `↓${injectCount}` : "",
                  extractCount > 0 ? `↑${extractCount}` : "",
                  overrideCount > 0 ? `=${overrideCount}` : "",
                ].join("")
              : null;
          const isActive = idx === activeIndex;
          return (
            <div key={step.stepKey} className="flex items-center gap-1.5 max-w-full">
              {idx > 0 ? (
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onSelectStep(idx)}
                    className={[
                      "inline-flex items-center justify-center gap-1 rounded-sm border h-8 px-2 font-mono text-[11px] font-medium transition-colors",
                      isActive
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-background hover:border-primary/30",
                    ].join(" ")}
                  >
                    <span>{runStepCaseIdLabel(step)}</span>
                    {badge ? (
                      <span className="text-[10px] font-mono font-normal text-amber-700 dark:text-amber-300">
                        {badge}
                      </span>
                    ) : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {step.title}
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
}

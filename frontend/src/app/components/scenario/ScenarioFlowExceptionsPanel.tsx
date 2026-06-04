import { AlertCircle } from "lucide-react";
import type { RuntimeFlowException } from "@/lib/scenarioRuntimeContext";

type Props = {
  exceptions: RuntimeFlowException[];
  onApplyRecovery: (ex: RuntimeFlowException) => void;
  onFocusStep: (stepIndex: number) => void;
};

export function ScenarioFlowExceptionsPanel({
  exceptions,
  onApplyRecovery,
  onFocusStep,
}: Props) {
  if (exceptions.length === 0) return null;

  return (
    <div className="rounded-sm border border-amber-500/35 bg-amber-500/5 px-3 py-3 space-y-2 shrink-0">
      <p className="text-xs font-medium text-amber-900 dark:text-amber-100 inline-flex items-center gap-1.5">
        <AlertCircle className="w-4 h-4" />
        흐름 누락 ({exceptions.length})
      </p>
      <ul className="space-y-2">
        {exceptions.map((ex) => (
          <li
            key={`${ex.stepIndex}-${ex.var}`}
            className="text-xs rounded-sm border border-amber-500/20 bg-background px-2.5 py-2"
          >
            <p className="text-foreground font-mono">
              <span className="font-sans text-muted-foreground">{ex.stepTitle}</span>
              {" · "}
              {ex.var}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">{ex.message}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                className="h-7 px-2.5 rounded-sm bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20"
                onClick={() => onApplyRecovery(ex)}
              >
                {ex.recoveryLabel}
              </button>
              <button
                type="button"
                className="h-7 px-2.5 rounded-sm border border-border text-[11px] hover:bg-muted"
                onClick={() => onFocusStep(ex.stepIndex)}
              >
                직접 수정
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

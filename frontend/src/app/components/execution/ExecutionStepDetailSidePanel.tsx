import { X } from "lucide-react";
import type { ExecutionStepViewModel } from "@/lib/executionStepView";
import { ExecutionStepDetailPanel } from "./ExecutionStepDetailPanel";
import { cn } from "../ui/utils";

type Props = {
  step: ExecutionStepViewModel;
  displayIndex: number;
  changesOnly: boolean;
  onClose: () => void;
};

export function ExecutionStepDetailSidePanel({
  step,
  displayIndex,
  changesOnly,
  onClose,
}: Props) {
  const method = (step.method ?? "POST").toUpperCase();

  return (
    <aside
      className={cn(
        "flex flex-col border-border bg-card w-full lg:w-1/2 lg:shrink-0",
        "border-t lg:border-t-0 lg:border-l",
        "max-h-[min(70vh,800px)] lg:max-h-none lg:min-h-[min(480px,60vh)]",
      )}
    >
      <div className="px-3 py-2.5 border-b border-border bg-muted/20 flex items-start justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground tabular-nums">
            요청 #{displayIndex + 1}
          </p>
          <p className="text-sm font-medium text-foreground line-clamp-2 mt-0.5">
            <span className="text-amber-600 dark:text-amber-400 font-bold mr-1.5">
              {method}
            </span>
            {step.label}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="상세 패널 닫기"
          className="shrink-0 p-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        <ExecutionStepDetailPanel step={step} changesOnly={changesOnly} embedded />
      </div>
    </aside>
  );
}

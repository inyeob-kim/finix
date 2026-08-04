import { ChevronRight } from "lucide-react";
import type { ExecutionStepViewModel } from "@/lib/executionStepView";
import { formatResponseSize } from "@/lib/executionStepView";
import { ExecutionAssertionList } from "./ExecutionAssertionList";
import { FinixStatusBadge } from "../ui/finix-status-badge";
import { cn } from "../ui/utils";

type Props = {
  step: ExecutionStepViewModel;
  displayIndex: number;
  selected: boolean;
  onSelectDetail: () => void;
};

function HttpStatusPill({ status }: { status: number | null }) {
  if (status == null) {
    return <FinixStatusBadge tone="muted">—</FinixStatusBadge>;
  }
  return (
    <FinixStatusBadge
      tone={status >= 400 ? "danger" : "success"}
      className="font-mono"
    >
      {status}
    </FinixStatusBadge>
  );
}

function TestCountChip({
  passed,
  failed,
}: {
  passed: number;
  failed: number;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] tabular-nums">
      {passed > 0 ? (
        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          {passed}
        </span>
      ) : null}
      {failed > 0 ? (
        <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300">
          {failed}
        </span>
      ) : null}
    </span>
  );
}

export function ExecutionRequestResultRow({
  step,
  displayIndex,
  selected,
  onSelectDetail,
}: Props) {
  const method = (step.method ?? "POST").toUpperCase();
  const sizeLabel = formatResponseSize(step.responseSizeBytes);

  return (
    <button
      type="button"
      onClick={onSelectDetail}
      aria-expanded={selected}
      aria-label={`${step.label} 요청/응답 상세 ${selected ? "닫기" : "열기"}`}
      className={cn(
        "w-full text-left border-b border-border py-3 px-1 transition-colors",
        "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        step.status === "failed" && !selected && "bg-rose-500/[0.02]",
        selected && "bg-primary/5 border-l-2 border-l-primary pl-2 -ml-1",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start gap-2 flex-wrap">
            <ChevronRight
              className={cn(
                "w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground transition-transform",
                selected && "rotate-90 text-primary",
              )}
            />
            <span className="text-[11px] font-bold uppercase text-amber-600 dark:text-amber-400 shrink-0 pt-0.5">
              {method}
            </span>
            <h4 className="text-sm font-medium text-foreground leading-snug">
              {step.label}
            </h4>
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 pt-0.5">
              #{displayIndex + 1}
            </span>
          </div>
          {step.requestUrl ? (
            <p className="text-[11px] font-mono text-muted-foreground break-all pl-5">
              {step.requestUrl}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          <HttpStatusPill status={step.actualStatus} />
          {step.responseTimeMs != null ? (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {step.responseTimeMs} ms
            </span>
          ) : null}
          {sizeLabel ? (
            <span className="text-[11px] tabular-nums text-muted-foreground hidden sm:inline">
              {sizeLabel}
            </span>
          ) : null}
          <TestCountChip
            passed={step.assertionPassedCount}
            failed={step.assertionFailedCount}
          />
        </div>
      </div>

      <div className="mt-2 ml-5">
        <ExecutionAssertionList assertions={step.assertions} />
      </div>
    </button>
  );
}

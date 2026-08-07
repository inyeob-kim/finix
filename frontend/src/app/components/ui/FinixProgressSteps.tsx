import { Check, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "./utils";

export type FinixProgressStep = {
  id: string;
  label: string;
  /** Shown under the label while this step is current (or just finished). */
  detail?: string;
};

export type FinixProgressOverall =
  | "pending"
  | "running"
  | "success"
  | "error";

export type FinixProgressStepState =
  | "pending"
  | "running"
  | "done"
  | "error";

export function finixProgressStepState(
  index: number,
  currentIndex: number,
  overall: FinixProgressOverall,
): FinixProgressStepState {
  if (overall === "success") return "done";
  if (overall === "error") {
    if (index < currentIndex) return "done";
    if (index === currentIndex) return "error";
    return "pending";
  }
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "running";
  return "pending";
}

type Props = {
  steps: FinixProgressStep[];
  currentIndex: number;
  status: FinixProgressOverall;
  /** Optional top row, e.g. "3 / 12" */
  metaLeft?: string;
  metaRight?: string;
  /** 0–100; when set, shows a thin bar under meta */
  progress?: number;
  className?: string;
};

/**
 * Shared “what we’re doing” step list for YAML jobs, scenario runs, pool tests.
 * No file names, diffs, or terminal chrome — labels only.
 */
export function FinixProgressSteps({
  steps,
  currentIndex,
  status,
  metaLeft,
  metaRight,
  progress,
  className,
}: Props) {
  const running = status === "running";
  const barWidth =
    progress != null
      ? Math.max(4, Math.min(100, progress))
      : status === "success" || status === "error"
        ? 100
        : steps.length <= 1
          ? running
            ? 35
            : 8
          : Math.round(((currentIndex + (running ? 0.35 : 1)) / steps.length) * 100);

  return (
    <div className={cn("space-y-3 min-w-0 overflow-x-hidden", className)}>
      {metaLeft || metaRight || progress != null ? (
        <div className="space-y-2 min-w-0">
          {(metaLeft || metaRight) && (
            <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground min-w-0">
              <span className="min-w-0 truncate">{metaLeft}</span>
              <span className="shrink-0 truncate max-w-[40%]">{metaRight}</span>
            </div>
          )}
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <motion.div
              className={cn(
                "h-full rounded-full",
                status === "error" ? "bg-destructive" : "bg-primary",
              )}
              initial={false}
              animate={{ width: `${Math.max(4, Math.min(100, barWidth))}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </div>
        </div>
      ) : null}

      <ol className="space-y-0 max-h-[min(22rem,50vh)] overflow-y-auto overflow-x-hidden min-w-0">
        {steps.map((step, i) => {
          const state = finixProgressStepState(i, currentIndex, status);
          const current = state === "running" || state === "error";
          const done = state === "done";
          const pending = state === "pending";
          const showDetail =
            Boolean(step.detail) &&
            (state === "running" ||
              (done && running && i === currentIndex - 1));

          return (
            <li
              key={step.id}
              className={cn(
                "flex gap-2.5 py-1.5 min-w-0",
                state === "running" && "finix-job-step-wave",
              )}
            >
              <span className="mt-0.5 w-3.5 shrink-0 inline-flex justify-center">
                {done ? (
                  <Check className="size-3.5 text-primary" strokeWidth={2.5} />
                ) : state === "running" ? (
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                ) : state === "error" ? (
                  <span className="mt-1 size-1.5 rounded-full bg-destructive" />
                ) : (
                  <span
                    className={cn(
                      "mt-1 size-1.5 rounded-full",
                      pending ? "bg-border" : "bg-muted-foreground/35",
                    )}
                  />
                )}
              </span>
              <div className="min-w-0 flex-1 overflow-hidden">
                <p
                  className={cn(
                    "text-[12px] leading-snug break-words",
                    state === "running" &&
                      "font-medium text-foreground finix-job-step-shimmer",
                    state === "error" && "text-destructive font-medium",
                    done && "text-muted-foreground",
                    pending && "text-muted-foreground/55",
                  )}
                >
                  {step.label}
                </p>
                {showDetail ? (
                  <p
                    className={cn(
                      "mt-0.5 text-[11px] leading-relaxed text-muted-foreground break-words",
                      state === "running" &&
                        "finix-job-step-shimmer opacity-80",
                    )}
                  >
                    {step.detail}
                  </p>
                ) : null}
                {current && !step.detail && state === "running" ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80 finix-job-step-shimmer">
                    진행 중…
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

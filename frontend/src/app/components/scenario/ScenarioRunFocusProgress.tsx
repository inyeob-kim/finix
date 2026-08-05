import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "../ui/utils";

export type ScenarioRunFocusStep = {
  key: string;
  label: string;
};

export type ScenarioRunFocusStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed";

type Props = {
  steps: ScenarioRunFocusStep[];
  currentIndex: number;
  status: ScenarioRunFocusStatus;
  total: number;
};

function statusLabel(status: ScenarioRunFocusStatus): string {
  if (status === "passed") return "PASS";
  if (status === "failed") return "FAIL";
  if (status === "running") return "실행 중";
  return "대기";
}

export function ScenarioRunFocusProgress({
  steps,
  currentIndex,
  status,
  total,
}: Props) {
  const safeTotal = Math.max(total, steps.length, 1);
  const step =
    steps[currentIndex] ??
    ({
      key: `fallback-${currentIndex}`,
      label: `Step ${currentIndex + 1}`,
    } satisfies ScenarioRunFocusStep);
  const displayIndex = Math.min(currentIndex, safeTotal - 1);
  const progressRatio =
    status === "passed" || status === "failed"
      ? (displayIndex + 1) / safeTotal
      : displayIndex / safeTotal;

  return (
    <div className="space-y-4 py-1">
      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>
          테스트 케이스{" "}
          <span className="tabular-nums text-foreground font-medium">
            {Math.min(displayIndex + 1, safeTotal)}
          </span>
          {" / "}
          <span className="tabular-nums">{safeTotal}</span>
        </span>
        <span className="truncate">{statusLabel(status)}</span>
      </div>

      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={cn(
            "h-full rounded-full",
            status === "failed" ? "bg-destructive" : "bg-primary",
          )}
          initial={false}
          animate={{ width: `${Math.max(4, progressRatio * 100)}%` }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        />
      </div>

      <div className="relative min-h-[96px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={step.key}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className={cn(
              "rounded-sm border px-4 py-4 bg-card",
              status === "failed"
                ? "border-destructive/35"
                : status === "passed"
                  ? "border-success/35"
                  : "border-border",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm",
                  status === "passed" && "bg-success/10 text-success",
                  status === "failed" && "bg-destructive/10 text-destructive",
                  status === "running" && "bg-primary/10 text-primary",
                  status === "pending" && "bg-muted text-muted-foreground",
                )}
              >
                {status === "passed" ? (
                  <Check className="h-4 w-4" />
                ) : status === "failed" ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    [{displayIndex + 1}]
                  </span>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium",
                      status === "passed" && "bg-success/10 text-success",
                      status === "failed" &&
                        "bg-destructive/10 text-destructive",
                      status === "running" && "bg-primary/10 text-primary",
                      status === "pending" &&
                        "bg-muted text-muted-foreground",
                    )}
                  >
                    {statusLabel(status)}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground line-clamp-3">
                  {step.label}
                </p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

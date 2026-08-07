import type { ReactNode } from "react";
import { cn } from "./utils";

/** Visual tone — matches scenario registry grid badges (borderless tint). */
export type FinixStatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted"
  | "neutral";

const TONE_CLASS: Record<FinixStatusTone, string> = {
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  danger: "bg-red-500/15 text-red-700 dark:text-red-300",
  info: "bg-primary/15 text-primary",
  muted: "bg-muted text-muted-foreground",
  neutral: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

export const FINIX_STATUS_BADGE_BASE_CLASS =
  "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap";

type FinixStatusBadgeProps = {
  tone: FinixStatusTone;
  children: ReactNode;
  className?: string;
  title?: string;
};

/** Shared grid/list status badge (scenario registry visual system). */
export function FinixStatusBadge({
  tone,
  children,
  className,
  title,
}: FinixStatusBadgeProps) {
  return (
    <span
      title={title}
      className={cn(FINIX_STATUS_BADGE_BASE_CLASS, TONE_CLASS[tone], className)}
    >
      {children}
    </span>
  );
}

type ScenarioBadgeStatus = "active" | "draft";

const SCENARIO_STATUS_LABEL: Record<ScenarioBadgeStatus, string> = {
  active: "완료",
  draft: "임시저장",
};

type ScenarioProps = {
  status: ScenarioBadgeStatus;
  className?: string;
};

export function FinixScenarioStatusBadge({ status, className }: ScenarioProps) {
  return (
    <FinixStatusBadge
      tone={status === "active" ? "success" : "warning"}
      className={className}
    >
      {SCENARIO_STATUS_LABEL[status]}
    </FinixStatusBadge>
  );
}

/** Rules registry / history status → tone + label. */
export function rulesRegistryStatusBadge(
  status: string,
  options?: { isActive?: boolean },
): { tone: FinixStatusTone; label: string } {
  const st = (status || "draft").toLowerCase();
  if (options?.isActive === true) {
    return { tone: "success", label: "적용됨" };
  }
  if (st === "history" || (options?.isActive === false && st === "active")) {
    return { tone: "neutral", label: "이력" };
  }
  if (st === "active") {
    return { tone: "success", label: "적용됨" };
  }
  if (st === "apply" || st === "restore" || st === "migrate") {
    return { tone: "muted", label: st === "restore" ? "복원" : st === "migrate" ? "이관" : "적용" };
  }
  if (st === "approved") {
    return { tone: "muted", label: "승인됨" };
  }
  if (st === "superseded") {
    return { tone: "muted", label: "대체됨" };
  }
  return { tone: "warning", label: "작업 중" };
}

type ExecutionStatus = "running" | "success" | "failed";

export function executionStatusBadge(status: ExecutionStatus): {
  tone: FinixStatusTone;
  label: string;
} {
  if (status === "running") {
    return { tone: "info", label: "진행" };
  }
  if (status === "success") {
    return { tone: "success", label: "성공" };
  }
  return { tone: "danger", label: "실패" };
}

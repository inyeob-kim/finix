import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { cn } from "./utils";

type FinixDotCanvasProps = {
  children: ReactNode;
  className?: string;
};

/** Dot-grid workbench surface (scenario / execution flows). */
export function FinixDotCanvas({ children, className }: FinixDotCanvasProps) {
  return (
    <div className={cn("finix-dot-canvas rounded-md border border-border", className)}>
      {children}
    </div>
  );
}

type FinixFlowPillProps = {
  children: ReactNode;
  tone?: "start" | "data" | "loop" | "end";
  className?: string;
};

export function FinixFlowPill({
  children,
  tone = "start",
  className,
}: FinixFlowPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold text-white",
        tone === "start" && "bg-flow-start",
        tone === "end" && "bg-flow-start",
        tone === "data" && "bg-flow-data",
        tone === "loop" && "bg-flow-loop",
        className,
      )}
    >
      {children}
    </span>
  );
}

type FinixFlowStepCardProps = {
  order: number | string;
  title: string;
  subtitle?: string;
  /** Compact meta on the header trailing edge (e.g. `v2`). */
  headerRight?: string;
  status?: "idle" | "passed" | "failed";
  className?: string;
};

/**
 * Compact step node used on flow canvases.
 * Header: short id (case_id). Body: readable title / meta (wraps).
 */
export function FinixFlowStepCard({
  order,
  title,
  subtitle,
  headerRight,
  status = "idle",
  className,
}: FinixFlowStepCardProps) {
  const orderLabel =
    typeof order === "number" ? String(order).padStart(2, "0") : order;

  return (
    <div
      className={cn(
        "min-w-[9.5rem] max-w-[12rem] overflow-hidden rounded-md border border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 bg-primary px-2.5 py-1.5 text-primary-foreground">
        <FileText className="size-3 shrink-0 opacity-90" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tabular-nums">
          {orderLabel}.{title}
        </span>
        {headerRight ? (
          <span className="shrink-0 text-[10px] font-semibold tabular-nums opacity-95">
            {headerRight}
          </span>
        ) : null}
      </div>
      <div className="space-y-1 bg-card px-2 py-1.5">
        {subtitle ? (
          <p className="text-[11px] font-medium leading-snug text-foreground line-clamp-3">
            {subtitle}
          </p>
        ) : null}
        {status !== "idle" ? (
          <div
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold",
              status === "passed" && "bg-success/10 text-success",
              status === "failed" && "bg-destructive/10 text-destructive",
            )}
          >
            {status === "passed" ? "PASS" : "FAIL"}
          </div>
        ) : null}
      </div>
    </div>
  );
}

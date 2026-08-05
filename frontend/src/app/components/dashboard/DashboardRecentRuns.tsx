import { Link } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import type { ExecutionHistoryRow } from "@/lib/executionHistoryView";
import {
  FinixStatusBadge,
  executionStatusBadge,
} from "../ui/finix-status-badge";
import { cn } from "../ui/utils";

function StatusBadge({ status }: { status: ExecutionHistoryRow["status"] }) {
  const { tone, label } = executionStatusBadge(status);
  return <FinixStatusBadge tone={tone}>{label}</FinixStatusBadge>;
}

type DashboardRecentRunsProps = {
  rows: ExecutionHistoryRow[];
  loading?: boolean;
};

export function DashboardRecentRuns({ rows, loading }: DashboardRecentRunsProps) {
  const prefersReducedMotion = useReducedMotion();

  if (loading && rows.length === 0) {
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">
        최근 실행 불러오는 중…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">
        최근 실행이 없습니다.{" "}
        <Link to="/scenario-registry" className="text-primary hover:underline">
          시나리오 관리
        </Link>
        에서 실행해 보세요.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/60">
      {rows.map((row, index) => (
        <motion.li
          key={row.id}
          initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            duration: 0.25,
            delay: prefersReducedMotion ? 0 : index * 0.035,
            ease: "easeOut",
          }}
        >
          <Link
            to={`/execution-result/${row.id}`}
            className={cn(
              "flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40",
              row.status === "failed" && "bg-destructive/[0.03]",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={row.status} />
                <span className="truncate text-sm font-medium">
                  {row.scenarioTitle}
                </span>
                {row.status === "running" ? (
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                #{row.id} · {row.modeLabel} · {row.summary}
              </p>
            </div>
            <time className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
              {row.occurredAt}
            </time>
          </Link>
        </motion.li>
      ))}
    </ul>
  );
}

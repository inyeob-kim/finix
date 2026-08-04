import { Link } from "react-router";
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
  if (loading) {
    return (
      <div className="rounded-md border border-border bg-muted/20 px-4 py-6 text-xs text-muted-foreground">
        최근 실행 불러오는 중…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card px-4 py-6 text-xs text-muted-foreground">
        최근 실행이 없습니다.{" "}
        <Link to="/scenario-registry" className="text-primary hover:underline">
          시나리오 관리
        </Link>
        에서 실행해 보세요.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          최근 실행
        </p>
        <Link
          to="/history"
          className="text-[11px] text-muted-foreground hover:text-primary"
        >
          전체 보기
        </Link>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              to={`/execution-result/${row.id}`}
              className={cn(
                "flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40",
                row.status === "failed" && "bg-destructive/[0.02]",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={row.status} />
                  <span className="truncate text-sm font-medium">
                    {row.scenarioTitle}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  #{row.id} · {row.modeLabel} · {row.summary}
                </p>
              </div>
              <time className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                {row.occurredAt}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

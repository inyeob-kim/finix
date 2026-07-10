import { Globe } from "lucide-react";
import type { ExecutionDetailDto } from "@/api/types";
import {
  formatDurationMs,
  type ExecutionRunSummaryView,
} from "@/lib/executionStepView";
import { cn } from "../ui/utils";

type Props = {
  detail: ExecutionDetailDto;
  summary: ExecutionRunSummaryView;
};

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-sm font-medium tabular-nums truncate",
          tone === "success" && "text-emerald-600 dark:text-emerald-400",
          tone === "danger" && "text-rose-600 dark:text-rose-400",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function ExecutionRunSummaryBar({ detail, summary }: Props) {
  const modeLabel =
    summary.mode === "live"
      ? "실행 API"
      : summary.mode === "simulate"
        ? "시뮬레이션"
        : "—";
  const duration = formatDurationMs(summary.durationMs) ?? "—";
  const avgResp =
    summary.avgResponseTimeMs != null
      ? `${summary.avgResponseTimeMs} ms`
      : "—";

  return (
    <div className="rounded-sm border border-border bg-card shadow-sm overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 px-4 py-3">
        <StatCell label="모드" value={modeLabel} />
        <StatCell label="소요 시간" value={duration} />
        <StatCell label="전체 테스트" value={String(summary.totalTests)} />
        <StatCell
          label="통과"
          value={String(summary.assertionPassed)}
          tone="success"
        />
        <StatCell
          label="실패"
          value={String(summary.assertionFailed)}
          tone={summary.assertionFailed > 0 ? "danger" : "default"}
        />
        <StatCell label="평균 응답" value={avgResp} />
        <StatCell
          label="요청"
          value={`${summary.passed} / ${summary.passed + summary.failed}`}
        />
      </div>
      {detail.base_url ? (
        <div className="px-4 py-2 border-t border-border flex items-start gap-2 text-xs bg-muted/10">
          <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <span className="font-mono break-all text-muted-foreground">
            {detail.base_url}
          </span>
        </div>
      ) : null}
    </div>
  );
}

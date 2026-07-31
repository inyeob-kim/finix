import type { DashboardOverviewDto } from "@/api/dataPoolApi";

type KpiCardProps = {
  label: string;
  value: string | number;
  hint?: string;
};

function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-3 min-w-[7.5rem]">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p> : null}
    </div>
  );
}

export function HistoryDashboardKpis({
  data,
  loading,
  compact,
}: {
  data: DashboardOverviewDto | null;
  loading?: boolean;
  /** Hide pool source/service footnotes (home strip). */
  compact?: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="rounded-md border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        KPI 불러오는 중…
      </div>
    );
  }
  if (!data) return null;

  const { pool, executions: ex } = data;
  const errTotal = ex.expected_error_passed + ex.expected_error_failed;
  const errRate =
    errTotal > 0
      ? `${Math.round((ex.expected_error_passed / errTotal) * 100)}%`
      : "—";
  const happyTotal = ex.happy_replay_passed + ex.happy_replay_failed;
  const happyRate =
    happyTotal > 0
      ? `${Math.round((ex.happy_replay_passed / happyTotal) * 100)}%`
      : "—";

  return (
    <div className="space-y-2 shrink-0">
      <div className="flex flex-wrap gap-2">
        <KpiCard label="Pool 전체" value={pool.total} hint={`H ${pool.happy} / N ${pool.negative}`} />
        <KpiCard label="실행 런" value={ex.runs_total} hint={`완료 ${ex.runs_completed}`} />
        <KpiCard
          label="스텝 Pass"
          value={ex.steps_passed}
          hint={`Fail ${ex.steps_failed}`}
        />
        <KpiCard label="Expected Error" value={errRate} hint={`${ex.expected_error_passed}/${errTotal || 0}`} />
        <KpiCard label="Happy Replay" value={happyRate} hint={`${ex.happy_replay_passed}/${happyTotal || 0}`} />
      </div>
      {!compact && Object.keys(pool.by_source).length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Pool 출처:{" "}
          {Object.entries(pool.by_source)
            .map(([k, v]) => `${k}=${v}`)
            .join(" · ")}
        </p>
      ) : null}
      {!compact && pool.by_service && pool.by_service.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          서비스 Top:{" "}
          {pool.by_service
            .slice(0, 8)
            .map((s) => `${s.service_code}(${s.happy}/${s.negative})`)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

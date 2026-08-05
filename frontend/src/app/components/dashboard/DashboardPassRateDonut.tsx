import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { PassRateSummary } from "@/lib/dashboardMetrics";
import { AnimatedNumber } from "./AnimatedNumber";

const CHART_HEIGHT = 180;
const PASS_COLOR = "var(--success)";
const FAIL_COLOR = "var(--destructive)";

type DashboardPassRateDonutProps = {
  summary: PassRateSummary;
  loading?: boolean;
};

function LegendRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <li className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span
        className="size-2 shrink-0 rounded-[2px]"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1">{label}</span>
      <span className="tabular-nums text-foreground">
        {value.toLocaleString("ko-KR")}
      </span>
    </li>
  );
}

export function DashboardPassRateDonut({
  summary,
  loading,
}: DashboardPassRateDonutProps) {
  if (loading && summary.total === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height: CHART_HEIGHT }}
      >
        Pass율 계산 중…
      </div>
    );
  }

  if (summary.total === 0) {
    return (
      <div
        className="flex items-center justify-center px-4 text-center text-xs text-muted-foreground"
        style={{ height: CHART_HEIGHT }}
      >
        집계할 스텝 결과가 없습니다.
      </div>
    );
  }

  const data = [
    { name: "Pass", value: summary.passed, color: PASS_COLOR },
    { name: "Fail", value: summary.failed, color: FAIL_COLOR },
  ];

  return (
    <div className="px-4 pb-4 pt-3">
      <div className="relative" style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="66%"
              outerRadius="88%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={data.every((d) => d.value > 0) ? 2 : 0}
              stroke="none"
              animationDuration={800}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums tracking-tight">
            <AnimatedNumber value={summary.percent} display={summary.display} />
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            step pass
          </span>
        </div>
      </div>
      <ul className="mt-3 space-y-1">
        <LegendRow color={PASS_COLOR} label="Pass" value={summary.passed} />
        <LegendRow color={FAIL_COLOR} label="Fail" value={summary.failed} />
      </ul>
    </div>
  );
}

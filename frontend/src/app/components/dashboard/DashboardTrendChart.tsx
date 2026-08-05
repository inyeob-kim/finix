import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ExecutionTrendPoint } from "@/lib/dashboardMetrics";
import {
  DashboardChartTooltip,
  type TooltipEntry,
} from "./DashboardChartTooltip";

const CHART_HEIGHT = 160;
const AXIS_TICK = { fontSize: 10, fill: "var(--muted-foreground)" };

/**
 * Rendered body height (CHART_HEIGHT + pt-3 + pb-1). Side-by-side panels cap
 * their scroll area with this so the row never grows past the chart.
 */
export const TREND_BODY_MAX_HEIGHT_CLASS = "max-h-[176px]";

type DashboardTrendChartProps = {
  points: ExecutionTrendPoint[];
  loading?: boolean;
};

function ChartMessage({ children }: { children: string }) {
  return (
    <div
      className="flex items-center justify-center px-4 text-xs text-muted-foreground"
      style={{ height: CHART_HEIGHT }}
    >
      {children}
    </div>
  );
}

export function DashboardTrendChart({
  points,
  loading,
}: DashboardTrendChartProps) {
  if (loading && points.length === 0) {
    return <ChartMessage>실행 추이 불러오는 중…</ChartMessage>;
  }
  if (points.every((point) => point.runs === 0)) {
    return <ChartMessage>선택한 기간에 실행 기록이 없습니다.</ChartMessage>;
  }

  return (
    <div className="px-1 pb-1 pt-3">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={points} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="trend-passed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="trend-failed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval="preserveStartEnd"
            minTickGap={18}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={28}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            content={(props) => (
              <DashboardChartTooltip
                active={props.active}
                label={props.label}
                payload={props.payload as TooltipEntry[] | undefined}
                hideZero
              />
            )}
          />
          <Area
            type="monotone"
            dataKey="passed"
            name="성공"
            stackId="runs"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#trend-passed)"
            animationDuration={700}
          />
          <Area
            type="monotone"
            dataKey="failed"
            name="실패"
            stackId="runs"
            stroke="var(--destructive)"
            strokeWidth={2}
            fill="url(#trend-failed)"
            animationDuration={700}
          />
          <Area
            type="monotone"
            dataKey="running"
            name="실행 중"
            stackId="runs"
            stroke="var(--muted-foreground)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            fill="none"
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

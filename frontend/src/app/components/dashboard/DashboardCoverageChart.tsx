import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CoverageBar } from "@/lib/dashboardMetrics";
import {
  DashboardChartTooltip,
  type TooltipEntry,
} from "./DashboardChartTooltip";

const ROW_HEIGHT = 30;
const MIN_CHART_HEIGHT = 140;
const AXIS_TICK = { fontSize: 10, fill: "var(--muted-foreground)" };

type DashboardCoverageChartProps = {
  bars: CoverageBar[];
  loading?: boolean;
};

function ChartMessage({ children }: { children: string }) {
  return (
    <div
      className="flex items-center justify-center px-4 text-xs text-muted-foreground"
      style={{ height: MIN_CHART_HEIGHT }}
    >
      {children}
    </div>
  );
}

export function DashboardCoverageChart({
  bars,
  loading,
}: DashboardCoverageChartProps) {
  if (loading && bars.length === 0) {
    return <ChartMessage>커버리지 불러오는 중…</ChartMessage>;
  }
  if (bars.length === 0) {
    return <ChartMessage>Pool 샘플이 있는 서비스가 없습니다.</ChartMessage>;
  }

  const height = Math.max(MIN_CHART_HEIGHT, bars.length * ROW_HEIGHT + 24);

  return (
    <div className="px-1 pb-2 pt-3">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={bars}
          layout="vertical"
          barCategoryGap={8}
          margin={{ top: 0, right: 16, bottom: 0, left: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            horizontal={false}
          />
          <XAxis
            type="number"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="service_code"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
            content={(props) => (
              <DashboardChartTooltip
                active={props.active}
                label={props.label}
                payload={props.payload as TooltipEntry[] | undefined}
              />
            )}
          />
          <Bar
            dataKey="happy"
            name="Happy"
            stackId="pool"
            fill="var(--primary)"
            radius={[2, 0, 0, 2]}
            animationDuration={700}
          />
          <Bar
            dataKey="negative"
            name="Negative"
            stackId="pool"
            fill="var(--flow-loop)"
            radius={[0, 2, 2, 0]}
            animationDuration={700}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

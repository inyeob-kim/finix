export type TooltipEntry = {
  name?: string | number;
  value?: string | number;
  color?: string;
  dataKey?: string | number;
};

type DashboardChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  /** Hide rows whose value is zero to keep sparse charts readable. */
  hideZero?: boolean;
};

export function DashboardChartTooltip({
  active,
  label,
  payload,
  hideZero,
}: DashboardChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const rows = hideZero
    ? payload.filter((entry) => Number(entry.value ?? 0) !== 0)
    : payload;
  if (rows.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 shadow-md">
      <p className="mb-1 text-[11px] font-medium text-foreground">{label}</p>
      <ul className="space-y-0.5">
        {rows.map((entry) => (
          <li
            key={String(entry.dataKey ?? entry.name)}
            className="flex items-center gap-2 text-[11px] text-muted-foreground"
          >
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: entry.color }}
            />
            <span className="flex-1">{entry.name}</span>
            <span className="tabular-nums text-foreground">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

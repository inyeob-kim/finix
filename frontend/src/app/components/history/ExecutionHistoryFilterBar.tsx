import { cn } from "../ui/utils";
import type { ExecutionHistoryDatePreset } from "@/lib/executionHistoryView";

const PRESETS: { key: ExecutionHistoryDatePreset; label: string }[] = [
  { key: "7d", label: "최근 7일" },
  { key: "today", label: "오늘" },
  { key: "30d", label: "30일" },
  { key: "all", label: "전체" },
  { key: "custom", label: "일자 지정" },
];

type Props = {
  preset: ExecutionHistoryDatePreset;
  onPresetChange: (preset: ExecutionHistoryDatePreset) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  timeStart: string;
  onTimeStartChange: (value: string) => void;
  timeEnd: string;
  onTimeEndChange: (value: string) => void;
  failuresOnly: boolean;
  onFailuresOnlyChange: (value: boolean) => void;
  failedCount: number;
  onRefresh: () => void;
};

export function ExecutionHistoryFilterBar({
  preset,
  onPresetChange,
  dateFrom,
  onDateFromChange,
  timeStart,
  onTimeStartChange,
  timeEnd,
  onTimeEndChange,
  failuresOnly,
  onFailuresOnlyChange,
  failedCount,
  onRefresh,
}: Props) {
  const showCustomDate = preset === "custom";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">기간</span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPresetChange(p.key)}
            className={cn(
              "h-8 px-3 rounded-sm border text-xs font-medium transition-colors",
              preset === p.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card hover:bg-muted",
            )}
          >
            {p.label}
          </button>
        ))}
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={failuresOnly}
            onChange={(e) => onFailuresOnlyChange(e.target.checked)}
            disabled={failedCount === 0 && !failuresOnly}
            className="accent-primary"
          />
          실패만
        </label>
        <button
          type="button"
          onClick={onRefresh}
          className="h-8 px-3 rounded-sm border border-border text-xs hover:bg-muted"
        >
          새로고침
        </button>
      </div>

      {showCustomDate ? (
        <div className="bg-muted/40 border border-border rounded-md p-4 flex flex-wrap items-end gap-4">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">발생 일자</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="block h-9 rounded-sm border border-border bg-card px-2 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">시작</span>
            <input
              type="time"
              value={timeStart}
              onChange={(e) => onTimeStartChange(e.target.value)}
              className="block h-9 rounded-sm border border-border bg-card px-2 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">종료</span>
            <input
              type="time"
              value={timeEnd}
              onChange={(e) => onTimeEndChange(e.target.value)}
              className="block h-9 rounded-sm border border-border bg-card px-2 text-sm"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

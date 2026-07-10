import { cn } from "../ui/utils";
import type { ExecutionResultFilter } from "@/lib/executionStepView";

type Props = {
  filter: ExecutionResultFilter;
  onFilterChange: (filter: ExecutionResultFilter) => void;
  totalCount: number;
  passedCount: number;
  failedCount: number;
};

function TabButton({
  active,
  label,
  count,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  tone?: "danger" | "success";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "ml-1.5 tabular-nums",
          tone === "danger" && count > 0 && "text-rose-600 dark:text-rose-400",
          tone === "success" && count > 0 && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        ({count})
      </span>
    </button>
  );
}

export function ExecutionRunFilterTabs({
  filter,
  onFilterChange,
  totalCount,
  passedCount,
  failedCount,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border">
      <TabButton
        active={filter === "all"}
        label="전체"
        count={totalCount}
        onClick={() => onFilterChange("all")}
      />
      <TabButton
        active={filter === "passed"}
        label="통과"
        count={passedCount}
        tone="success"
        onClick={() => onFilterChange("passed")}
      />
      <TabButton
        active={filter === "failed"}
        label="실패"
        count={failedCount}
        tone="danger"
        onClick={() => onFilterChange("failed")}
      />
    </div>
  );
}

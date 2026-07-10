import { cn } from "../ui/utils";

type Props = {
  totalCount: number;
  visibleCount: number;
  failedCount: number;
  failuresOnly: boolean;
  onFailuresOnlyChange: (value: boolean) => void;
  changesOnly: boolean;
  onChangesOnlyChange: (value: boolean) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
};

export function ExecutionTimelineToolbar({
  totalCount,
  visibleCount,
  failedCount,
  failuresOnly,
  onFailuresOnlyChange,
  changesOnly,
  onChangesOnlyChange,
  onExpandAll,
  onCollapseAll,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <p className="text-xs text-muted-foreground">
        {failuresOnly
          ? `실패 ${visibleCount} / 전체 ${totalCount}단계`
          : `전체 ${totalCount}단계`}
        {failedCount > 0 ? ` · 실패 ${failedCount}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer">
          <input
            type="checkbox"
            checked={failuresOnly}
            onChange={(e) => onFailuresOnlyChange(e.target.checked)}
            disabled={failedCount === 0}
            className="accent-primary"
          />
          실패만
        </label>
        <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer">
          <input
            type="checkbox"
            checked={changesOnly}
            onChange={(e) => onChangesOnlyChange(e.target.checked)}
            className="accent-primary"
          />
          변경 필드만
        </label>
        <button
          type="button"
          className={cn(
            "h-7 px-2 rounded-sm border border-border text-[11px]",
            "hover:bg-muted transition-colors",
          )}
          onClick={onExpandAll}
        >
          전체 펼치기
        </button>
        <button
          type="button"
          className={cn(
            "h-7 px-2 rounded-sm border border-border text-[11px]",
            "hover:bg-muted transition-colors",
          )}
          onClick={onCollapseAll}
        >
          전체 접기
        </button>
      </div>
    </div>
  );
}

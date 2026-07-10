import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { Link } from "react-router";
import type { ExecutionBatchListItem } from "@/lib/executionBatchView";
import { cn } from "../ui/utils";

type Props = {
  items: ExecutionBatchListItem[];
  selectedId: number | null;
  onSelect: (executionId: number) => void;
  runErrors?: string[];
};

export function ExecutionBatchSidebar({
  items,
  selectedId,
  onSelect,
  runErrors = [],
}: Props) {
  return (
    <aside className="w-full lg:w-72 shrink-0 border border-border rounded-sm bg-card shadow-sm overflow-hidden flex flex-col max-h-[min(70vh,720px)]">
      <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
        시나리오 {items.length}건
      </div>
      <div className="overflow-y-auto flex-1 p-2 space-y-1">
        {items.map((item, idx) => {
          const selected = selectedId === item.executionId;
          return (
            <button
              key={item.executionId}
              type="button"
              onClick={() => onSelect(item.executionId)}
              className={cn(
                "w-full text-left rounded-sm border px-3 py-2.5 transition-colors",
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted/50",
                item.failedScenario && !selected && "border-destructive/25",
              )}
            >
              <div className="flex items-start gap-2">
                {item.failedScenario ? (
                  <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    [{idx + 1}]
                  </p>
                  <p className="text-sm font-medium line-clamp-2">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    #{item.executionId} · 성공 {item.passed} / 실패{" "}
                    <span
                      className={
                        item.failed > 0 ? "text-destructive font-medium" : ""
                      }
                    >
                      {item.failed}
                    </span>
                  </p>
                </div>
              </div>
            </button>
          );
        })}
        {runErrors.map((msg) => (
          <div
            key={msg}
            className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive"
          >
            {msg}
          </div>
        ))}
      </div>
    </aside>
  );
}

type SummaryProps = {
  collectionName?: string;
  scenarioCount: number;
  failedScenarios: number;
  passedSteps: number;
  failedSteps: number;
  skipped?: number;
  onJumpToFirstFailure?: () => void;
};

export function ExecutionBatchSummaryBar({
  collectionName,
  scenarioCount,
  failedScenarios,
  passedSteps,
  failedSteps,
  skipped,
  onJumpToFirstFailure,
}: SummaryProps) {
  const allPassed = failedScenarios === 0 && scenarioCount > 0;

  return (
    <div className="rounded-sm border border-border bg-card px-4 py-3 shadow-sm flex flex-wrap items-center gap-3">
      <span
        className={cn(
          "inline-flex px-2 py-0.5 rounded text-xs font-medium",
          allPassed
            ? "bg-success/10 text-success"
            : failedScenarios > 0
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground",
        )}
      >
        {allPassed
          ? "전체 성공"
          : `${failedScenarios}/${scenarioCount} 시나리오 실패`}
      </span>
      {collectionName ? (
        <span className="text-sm text-foreground truncate max-w-[240px]">
          {collectionName}
        </span>
      ) : null}
      <span className="text-xs text-muted-foreground tabular-nums">
        스텝 {passedSteps}성공 / {failedSteps}실패
      </span>
      {skipped != null && skipped > 0 ? (
        <span className="text-xs text-muted-foreground">제외 {skipped}건</span>
      ) : null}
      {failedScenarios > 0 && onJumpToFirstFailure ? (
        <button
          type="button"
          onClick={onJumpToFirstFailure}
          className="ml-auto text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          첫 실패로 이동
          <ExternalLink className="w-3 h-3" />
        </button>
      ) : null}
    </div>
  );
}

export function ExecutionBatchSingleLink({
  executionId,
  batchReturnPath,
}: {
  executionId: number;
  batchReturnPath: string;
}) {
  return (
    <Link
      to={`/execution-result/${executionId}`}
      state={{ from: batchReturnPath }}
      className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
    >
      단일 결과 화면
      <ExternalLink className="w-3 h-3" />
    </Link>
  );
}

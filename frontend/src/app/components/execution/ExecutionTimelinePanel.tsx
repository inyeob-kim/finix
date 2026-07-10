import { useEffect, useMemo, useState } from "react";
import type { ExecutionDetailDto } from "@/api/types";
import {
  filterExecutionSteps,
  parseExecutionRunSummary,
  parseExecutionStep,
  type ExecutionResultFilter,
  type ExecutionStepViewModel,
} from "@/lib/executionStepView";
import { ExecutionRequestResultRow } from "./ExecutionRequestResultRow";
import { ExecutionRunFilterTabs } from "./ExecutionRunFilterTabs";
import { ExecutionRunSummaryBar } from "./ExecutionRunSummaryBar";
import { ExecutionStepDetailSidePanel } from "./ExecutionStepDetailSidePanel";
import { cn } from "../ui/utils";

type Props = {
  detail: ExecutionDetailDto;
};

export function ExecutionTimelinePanel({ detail }: Props) {
  const [filter, setFilter] = useState<ExecutionResultFilter>("all");
  const [changesOnly, setChangesOnly] = useState(false);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(
    null,
  );

  const steps = useMemo(
    () => detail.steps.map(parseExecutionStep),
    [detail.steps],
  );
  const summary = useMemo(
    () => parseExecutionRunSummary(detail.summary, steps),
    [detail.summary, steps],
  );
  const visibleSteps = useMemo(
    () => filterExecutionSteps(steps, filter),
    [steps, filter],
  );

  const selectedStep: ExecutionStepViewModel | null =
    selectedStepIndex != null ? (steps[selectedStepIndex] ?? null) : null;

  useEffect(() => {
    setSelectedStepIndex(null);
  }, [detail.id]);

  useEffect(() => {
    if (selectedStepIndex == null) return;
    const step = steps[selectedStepIndex];
    if (!step) {
      setSelectedStepIndex(null);
      return;
    }
    const stillVisible = visibleSteps.some((s) => s.stepIndex === step.stepIndex);
    if (!stillVisible) {
      setSelectedStepIndex(null);
    }
  }, [filter, selectedStepIndex, steps, visibleSteps]);

  const ranAt = new Date(detail.created_at).toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const toggleStepDetail = (displayIndex: number) => {
    setSelectedStepIndex((prev) => (prev === displayIndex ? null : displayIndex));
  };

  return (
    <div className="space-y-4">
      <ExecutionRunSummaryBar detail={detail} summary={summary} />

      <div className="rounded-sm border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-muted/15 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {ranAt}에 실행 · #{detail.id}
          </p>
          <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer text-muted-foreground">
            <input
              type="checkbox"
              checked={changesOnly}
              onChange={(e) => setChangesOnly(e.target.checked)}
              className="accent-primary"
            />
            상세 JSON · 변경 필드만
          </label>
        </div>

        <div className="px-4 pt-2 border-b border-border lg:border-b-0">
          <ExecutionRunFilterTabs
            filter={filter}
            onFilterChange={setFilter}
            totalCount={steps.length}
            passedCount={summary.passed}
            failedCount={summary.failed}
          />
        </div>

        <div className="flex flex-col lg:flex-row lg:items-stretch">
          <div
            className={cn(
              "min-w-0 px-4 pb-2",
              selectedStep != null
                ? "lg:w-1/2 lg:max-h-[min(70vh,800px)] lg:overflow-y-auto"
                : "w-full",
            )}
          >
            <div className="text-[11px] font-medium text-muted-foreground py-2">
              반복 1
            </div>
            {visibleSteps.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {filter === "failed"
                  ? "실패한 요청이 없습니다."
                  : filter === "passed"
                    ? "통과한 요청이 없습니다."
                    : "실행된 요청이 없습니다."}
              </p>
            ) : (
              <div>
                {visibleSteps.map((step) => {
                  const displayIndex = steps.indexOf(step);
                  return (
                    <ExecutionRequestResultRow
                      key={`${step.label}-${step.stepIndex}-${displayIndex}`}
                      step={step}
                      displayIndex={displayIndex}
                      selected={selectedStepIndex === displayIndex}
                      onSelectDetail={() => toggleStepDetail(displayIndex)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {selectedStep != null && selectedStepIndex != null ? (
            <ExecutionStepDetailSidePanel
              step={selectedStep}
              displayIndex={selectedStepIndex}
              changesOnly={changesOnly}
              onClose={() => setSelectedStepIndex(null)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

import type { ExecutionDetailDto } from "@/api/types";
import {
  deriveExecutionHistoryStatus,
  executionModeLabel,
  formatExecutionSummary,
} from "@/lib/executionHistoryView";
import {
  formatResponseSize,
  parseExecutionStep,
  prettyExecutionJson,
  type ExecutionStepViewModel,
} from "@/lib/executionStepView";
import { useEffect, useMemo, useState } from "react";
import { ExecutionAssertionList } from "../execution/ExecutionAssertionList";
import { FinixStatusBadge } from "../ui/finix-status-badge";
import { cn } from "../ui/utils";

type Props = {
  result: ExecutionDetailDto;
};

function StepMetaRow({ step }: { step: ExecutionStepViewModel }) {
  const method = (step.method ?? "POST").toUpperCase();
  const sizeLabel = formatResponseSize(step.responseSizeBytes);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold uppercase text-amber-600 dark:text-amber-400">
        {method}
      </span>
      <FinixStatusBadge
        tone={
          step.actualStatus == null
            ? "muted"
            : step.actualStatus >= 400
              ? "danger"
              : "success"
        }
        className="font-mono"
      >
        {step.actualStatus ?? "—"}
      </FinixStatusBadge>
      {step.responseTimeMs != null ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {step.responseTimeMs} ms
        </span>
      ) : null}
      {sizeLabel ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {sizeLabel}
        </span>
      ) : null}
      {step.expectedStatus != null ? (
        <span className="text-[11px] text-muted-foreground">
          기대 {step.expectedStatus}
          {step.statusMatch ? "" : " · 불일치"}
        </span>
      ) : null}
    </div>
  );
}

function JsonBlock({
  label,
  value,
  emptyMessage,
  hideEmptyObject = false,
}: {
  label: string;
  value: unknown;
  emptyMessage: string;
  hideEmptyObject?: boolean;
}) {
  const isEmptyObject =
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0;
  const hasValue =
    value !== undefined &&
    value !== null &&
    !(hideEmptyObject && isEmptyObject);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-1">
      <p className="shrink-0 text-[11px] font-medium text-muted-foreground">
        {label}
      </p>
      {hasValue ? (
        <pre className="min-h-0 flex-1 overflow-auto rounded-sm border border-border/50 bg-background/80 px-2.5 py-2 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all">
          {prettyExecutionJson(value)}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      )}
    </div>
  );
}

function StepDetailBody({ step }: { step: ExecutionStepViewModel }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="shrink-0 space-y-2">
        <StepMetaRow step={step} />
        {step.requestUrl || step.endpoint ? (
          <p className="text-[11px] font-mono text-muted-foreground break-all">
            {step.requestUrl || step.endpoint}
          </p>
        ) : null}
        {step.assertions.length > 0 ? (
          <ExecutionAssertionList assertions={step.assertions} />
        ) : null}
        {step.errorMessage ? (
          <p className="text-xs text-destructive break-words">{step.errorMessage}</p>
        ) : null}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
        <JsonBlock
          label="요청 input (실행 시)"
          value={step.resolvedRequestBody}
          emptyMessage="요청 input 없음"
          hideEmptyObject
        />
        <JsonBlock
          label="응답 body"
          value={step.actualBody}
          emptyMessage="응답 body 없음"
        />
      </div>
    </div>
  );
}

function StepListSidebar({
  steps,
  selectedIdx,
  onSelect,
}: {
  steps: ExecutionStepViewModel[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}) {
  const failedCount = steps.filter((s) => s.status === "failed").length;
  const passedCount = steps.length - failedCount;

  return (
    <aside className="flex h-full min-h-0 w-[13.5rem] shrink-0 flex-col border-r border-border/60 bg-muted/20">
      <div className="shrink-0 border-b border-border/50 px-2.5 py-2">
        <p className="text-[11px] font-medium text-foreground">테스트케이스</p>
        <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
          {steps.length}건 · 성공 {passedCount}
          {failedCount > 0 ? ` · 실패 ${failedCount}` : ""}
        </p>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {steps.map((step, idx) => {
          const active = idx === selectedIdx;
          const failed = step.status === "failed";
          return (
            <li key={`${step.stepIndex}-${step.testcaseId ?? idx}`}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-start gap-2 px-2.5 py-2 text-left transition-colors",
                  active
                    ? "bg-primary/8 border-l-2 border-l-primary"
                    : "border-l-2 border-l-transparent hover:bg-muted/60",
                )}
                onClick={() => onSelect(idx)}
              >
                <span
                  className={cn(
                    "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    failed ? "bg-destructive" : "bg-emerald-500",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium text-foreground">
                    {step.label}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className={failed ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
                      {failed ? "실패" : "성공"}
                    </span>
                    <span className="font-mono tabular-nums">
                      {step.actualStatus ?? "—"}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export function TestCaseRunResultSummary({ result }: Props) {
  const status = deriveExecutionHistoryStatus(result);
  const statusLabel =
    status === "failed" ? "실패" : status === "running" ? "실행 중" : "성공";
  const statusTone =
    status === "failed" ? "danger" : status === "running" ? "info" : "success";

  const steps = useMemo(
    () => result.steps.map((row) => parseExecutionStep(row)),
    [result.steps],
  );

  const defaultSelected = useMemo(() => {
    const failedIdx = steps.findIndex((s) => s.status === "failed");
    return failedIdx >= 0 ? failedIdx : 0;
  }, [steps]);

  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    setSelectedIdx(defaultSelected);
  }, [result.id, defaultSelected]);

  const selected =
    steps[Math.min(Math.max(selectedIdx, 0), Math.max(steps.length - 1, 0))] ??
    null;
  const multi = steps.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <FinixStatusBadge tone={statusTone}>{statusLabel}</FinixStatusBadge>
        <span className="text-xs text-muted-foreground">
          {executionModeLabel(result.summary)}
        </span>
        <span className="text-xs text-muted-foreground">
          · {formatExecutionSummary(result)}
        </span>
      </div>

      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">실행 단계가 없습니다.</p>
      ) : multi ? (
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-sm border border-border/60">
          <StepListSidebar
            steps={steps}
            selectedIdx={selectedIdx}
            onSelect={setSelectedIdx}
          />
          {selected ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/10 px-3 py-2.5">
              <p className="mb-2 shrink-0 truncate text-xs font-medium">
                {selected.label}
              </p>
              <StepDetailBody step={selected} />
            </div>
          ) : null}
        </div>
      ) : selected ? (
        <div className="flex min-h-0 flex-1 flex-col rounded-sm border border-border/60 bg-muted/10 px-3 py-2.5">
          <StepDetailBody step={selected} />
        </div>
      ) : null}
    </div>
  );
}

import { useMemo, useState } from "react";
import {
  ArrowDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import type { FlowStepNarrative } from "@/lib/scenarioFlowUx";
import { buildFlowSummarySegments, countCoreLinks } from "@/lib/scenarioFlowUx";
import { FlowVariableGroup } from "./FlowVariableGroup";
import { FinixLoading } from "../ui/finix-loading";
import { cn } from "../ui/utils";

type Props = {
  steps: FlowStepNarrative[];
  loading: boolean;
  approved: boolean;
  sourceLabel: string | null;
  onApprove: () => void;
  onRegenerate: () => void;
  onEditExceptions: () => void;
  exceptionCount: number;
};

function FlowStepCard({ row }: { row: FlowStepNarrative }) {
  return (
    <article className="rounded-sm border border-border bg-background px-3 py-3 space-y-2.5 shadow-sm">
      <header className="border-b border-border/70 pb-2">
        <h4 className="text-sm font-semibold text-foreground">
          <span className="text-muted-foreground tabular-nums font-medium mr-1.5">
            [{row.order}]
          </span>
          {row.caseId} {row.displayName}
        </h4>
        {row.subLabel ? (
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {row.subLabel}
          </p>
        ) : null}
      </header>

      <FlowVariableGroup title="사용 변수" items={row.usedFromPrior} tone="used" />
      <FlowVariableGroup title="생성 변수" items={row.saved} tone="created" />

      {row.saved.length === 0 && row.usedFromPrior.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">단독 실행</p>
      ) : null}
    </article>
  );
}

export function ScenarioAutoExecutionFlowCard({
  steps,
  loading,
  approved,
  sourceLabel,
  onApprove,
  onRegenerate,
  onEditExceptions,
  exceptionCount,
}: Props) {
  const [showDetailCards, setShowDetailCards] = useState(false);

  const { total: linkTotal, auto: linkAuto } = useMemo(
    () => countCoreLinks(steps),
    [steps],
  );

  const summarySegments = useMemo(
    () => buildFlowSummarySegments(steps),
    [steps],
  );

  const ready = !loading && steps.length > 0;

  return (
    <div
      className={cn(
        "rounded-sm border shrink-0 overflow-hidden",
        approved
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-border bg-card",
      )}
    >
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          {ready ? (
            <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              자동 연결 완료
              {linkTotal > 0 ? (
                <span className="opacity-80">
                  · 연결 {linkAuto}/{linkTotal}
                </span>
              ) : null}
            </span>
          ) : null}
          <h3 className="text-sm font-semibold text-foreground">실행 흐름</h3>
          <p className="text-[11px] text-muted-foreground">
            {loading
              ? "흐름을 분석하는 중…"
              : sourceLabel
                ? `${sourceLabel} · 요약 확인 후 승인`
                : "핵심 연결만 먼저 표시합니다"}
          </p>
        </div>
        <button
          type="button"
          className="h-7 px-2 rounded-sm border border-border text-[11px] hover:bg-muted inline-flex items-center gap-1 shrink-0"
          disabled={loading}
          onClick={onRegenerate}
        >
          <RefreshCw className="w-3 h-3" />
          다시 생성
        </button>
      </div>

      <div className="px-4 py-3 space-y-2 max-h-[min(40vh,360px)] overflow-y-auto">
        {loading ? (
          <FinixLoading size="sm" inline label="실행 흐름 생성 중…" />
        ) : (
          <div className="space-y-0.5 text-sm">
            {summarySegments.map((seg, idx) => {
              if (seg.kind === "step" && seg.step) {
                const s = seg.step;
                const created = s.saved
                  .filter((x) => x.isKey)
                  .map((x) => x.var);
                const used = s.usedFromPrior
                  .filter((x) => x.isKey)
                  .map((x) => x.var);
                const headline =
                  created.length > 0
                    ? `→ ${created.join(", ")} 생성`
                    : used.length > 0
                      ? `← ${used.join(", ")} 사용`
                      : null;
                return (
                  <div key={`step-${s.stepIndex}`} className="py-1.5">
                    <p className="font-semibold text-foreground leading-snug">
                      {s.order}.{" "}
                      <span className="font-mono text-[13px]">{s.caseId}</span>{" "}
                      {s.displayName}
                    </p>
                    {headline ? (
                      <p className="text-xs font-mono text-foreground/90 mt-0.5 pl-3">
                        {headline}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground pl-3 mt-0.5">
                        단독 실행
                      </p>
                    )}
                  </div>
                );
              }
              if (seg.kind === "bridge") {
                return (
                  <div
                    key={`bridge-${idx}`}
                    className="flex items-center gap-1.5 py-0.5 pl-3 text-[11px]"
                  >
                    <ArrowDown className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                    <span className="font-mono text-primary font-medium">
                      {seg.line ?? "자동 연결"}
                    </span>
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}

        {ready ? (
          <button
            type="button"
            className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 pt-2"
            onClick={() => setShowDetailCards((v) => !v)}
          >
            {showDetailCards ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                세부 변수 접기
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                세부 변수 보기
              </>
            )}
          </button>
        ) : null}

        {showDetailCards && ready ? (
          <div className="space-y-2 pt-3 border-t border-border">
            {steps.map((row, idx) => (
              <div key={row.stepIndex}>
                <FlowStepCard row={row} />
                {idx < steps.length - 1 ? (
                  <div className="flex justify-center py-1.5 text-muted-foreground/60">
                    <ArrowDown className="w-4 h-4" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="px-4 py-3 border-t border-border flex flex-wrap items-center gap-2 bg-muted/20">
        {!approved ? (
          <button
            type="button"
            disabled={loading}
            onClick={onApprove}
            className="h-9 px-4 rounded-sm bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            흐름 승인
          </button>
        ) : (
          <span className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            승인 완료
          </span>
        )}
        {exceptionCount > 0 ? (
          <button
            type="button"
            className="h-9 px-3 rounded-sm border border-amber-500/40 text-amber-900 dark:text-amber-100 text-sm hover:bg-amber-500/10"
            onClick={onEditExceptions}
          >
            예외 수정 ({exceptionCount})
          </button>
        ) : (
          <button
            type="button"
            className="h-9 px-3 rounded-sm border border-border text-sm text-muted-foreground hover:bg-muted"
            onClick={onEditExceptions}
          >
            흐름 테스트·수정
          </button>
        )}
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { BookOpen } from "lucide-react";
import type { ScenarioResolvePreviewDto } from "@/api/types";
import type { FlowStepNarrative } from "@/lib/scenarioFlowUx";
import { extractMockFromBody, mockDisplayValue } from "@/lib/scenarioFlowUx";
import { FinixLoading } from "../ui/finix-loading";

type Props = {
  narrative: FlowStepNarrative[];
  preview: ScenarioResolvePreviewDto | null;
  loading: boolean;
  error: string | null;
};

export function ScenarioExecutionPreviewPanel({
  narrative,
  preview,
  loading,
  error,
}: Props) {
  const previewByIndex = useMemo(() => {
    const map = new Map<number, (typeof preview.steps)[0]>();
    if (!preview) return map;
    for (const row of preview.steps) {
      if (!map.has(row.step_index)) map.set(row.step_index, row);
    }
    return map;
  }, [preview]);

  return (
    <div className="rounded-sm border border-border bg-muted/10 shrink-0">
      <div className="px-3 py-2 border-b border-border/80 flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">실행 예시</span>
        <span className="text-[10px] text-muted-foreground">샘플 값</span>
      </div>
      <div className="px-3 py-3 max-h-[min(24vh,220px)] overflow-y-auto space-y-3">
        {loading ? (
          <FinixLoading size="sm" inline label="예시 생성 중…" />
        ) : error ? (
          <p className="text-xs text-muted-foreground">{error}</p>
        ) : (
          narrative.map((row, idx) => {
            const resolved = previewByIndex.get(row.stepIndex);
            const simBody = resolved?.simulated_response_body;
            const keySaved = row.saved.filter((s) => s.isKey);
            const savedShow =
              keySaved.length > 0 ? keySaved : row.saved.slice(0, 2);
            const keyUsed = row.usedFromPrior.filter((u) => u.isKey);
            const usedShow =
              keyUsed.length > 0 ? keyUsed : row.usedFromPrior.slice(0, 2);

            const isLast = idx === narrative.length - 1;

            return (
              <div key={row.stepIndex} className="text-xs space-y-1">
                <p className="text-foreground leading-snug">
                  <span className="font-semibold">
                    {row.caseId} {row.displayName}
                  </span>
                  {savedShow.length > 0 || row.usedFromPrior.length === 0 ? (
                    <span className="text-muted-foreground"> 완료</span>
                  ) : (
                    <span className="text-muted-foreground"> 실행</span>
                  )}
                </p>

                {savedShow.map((s) => {
                  const val =
                    extractMockFromBody(simBody ?? undefined, s.var) ??
                    (preview?.context_after?.[s.var] != null
                      ? JSON.stringify(preview.context_after[s.var]).slice(
                          0,
                          28,
                        )
                      : null) ??
                    mockDisplayValue(s.var, row.order);
                  return (
                    <p
                      key={s.var}
                      className="pl-3 text-muted-foreground font-mono text-[11px]"
                    >
                      → <span className="text-foreground">{s.var}</span> ={" "}
                      {val}
                    </p>
                  );
                })}

                {usedShow.map((u) => (
                  <p
                    key={u.var}
                    className="pl-3 text-muted-foreground text-[11px]"
                  >
                    → 동일 <span className="font-mono text-foreground">{u.var}</span>{" "}
                    자동 삽입
                  </p>
                ))}

                {!isLast && usedShow.length === 0 && savedShow.length === 0 ? (
                  <p className="pl-3 text-[11px] text-muted-foreground">
                    다음 단계로 진행
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

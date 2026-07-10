import { ExternalLink, Globe, Layers, Radio } from "lucide-react";
import type { ExecutionDetailDto } from "@/api/types";
import { executionModeFromSummary } from "@/lib/executionStepView";
import { cn } from "../ui/utils";

type Props = {
  detail: ExecutionDetailDto;
  passed: number;
  failed: number;
  scenarioTitle?: string | null;
  onOpenScenario?: () => void;
};

export function ExecutionResultMetaBar({
  detail,
  passed,
  failed,
  scenarioTitle,
  onOpenScenario,
}: Props) {
  const mode = executionModeFromSummary(detail.summary);
  const allPassed = failed === 0 && passed > 0;

  return (
    <div className="rounded-sm border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-border bg-muted/20">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium",
            allPassed
              ? "bg-success/10 text-success"
              : failed > 0
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground",
          )}
        >
          {detail.status === "completed" ? "완료" : detail.status}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-border bg-background">
          <Radio className="w-3 h-3 text-muted-foreground" />
          {mode === "live"
            ? "실행 API"
            : mode === "simulate"
              ? "시뮬레이션"
              : "모드 알 수 없음"}
        </span>
        {detail.scenario_id != null ? (
          onOpenScenario ? (
            <button
              type="button"
              onClick={onOpenScenario}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline max-w-[min(100%,280px)]"
              title="시나리오 테스트 케이스 화면으로"
            >
              <Layers className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {scenarioTitle?.trim() || `시나리오 #${detail.scenario_id}`}
              </span>
              <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Layers className="w-3 h-3" />
              {scenarioTitle?.trim() || `시나리오 #${detail.scenario_id}`}
            </span>
          )
        ) : null}
        <span className="text-xs text-muted-foreground tabular-nums">
          전체 {passed + failed} · 성공 {passed} · 실패 {failed}
        </span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {detail.base_url ? (
          <div className="flex items-start gap-2 text-sm">
            <Globe className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground">Base URL</div>
              <div className="font-mono text-xs break-all">{detail.base_url}</div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Base URL 없음 — 시뮬레이션 또는 상대 경로 기준 실행
          </p>
        )}
      </div>
    </div>
  );
}

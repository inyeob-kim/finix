import { X } from "lucide-react";
import type { ScenarioRegistryItem } from "../types";
import { countBindingRows } from "@/lib/scenarioBindings";
import {
  buildRunStepsFromPicks,
  runStepCaseIdLabel,
  serviceNameMapFromDrafts,
} from "@/lib/scenarioRunSequence";
import { FinixScenarioStatusBadge } from "../../ui/finix-status-badge";
import { cn } from "../../ui/utils";

export function ScenarioPreviewPanel({
  selectedScenario,
  onClose,
}: {
  selectedScenario: ScenarioRegistryItem | null;
  onClose: () => void;
}) {
  return (
    <aside
      className={cn(
        "flex flex-col border-border bg-card w-full lg:w-1/2 lg:shrink-0",
        "border-t lg:border-t-0 lg:border-l",
        "max-h-[min(70vh,800px)] lg:max-h-none lg:min-h-0",
      )}
    >
      <div className="px-3 py-2.5 border-b border-border bg-muted/20 flex items-start justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">시나리오 미리보기</p>
          {selectedScenario ? (
            <p className="text-sm font-medium text-foreground line-clamp-2 mt-0.5">
              {selectedScenario.title}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="미리보기 패널 닫기"
          className="shrink-0 p-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {selectedScenario ? (
          <div className="space-y-4">
            <div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <FinixScenarioStatusBadge status={selectedScenario.status} />
                <span className="text-xs text-muted-foreground tabular-nums">
                  테스트 케이스{" "}
                  {(selectedScenario.selectedRuleTestcases ?? []).length}개
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {selectedScenario.updatedAt} · {selectedScenario.updatedBy}
              </div>
            </div>

            <div className="rounded-sm border border-border bg-card p-4 space-y-2">
              <div className="text-sm font-medium">테스트 케이스 플로우</div>
              {(selectedScenario.selectedRuleTestcases ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  등록 시 선택한 테스트 케이스가 없습니다.
                </p>
              ) : (
                <div className="space-y-2">
                  {buildRunStepsFromPicks(
                    selectedScenario.selectedRuleTestcases ?? [],
                    serviceNameMapFromDrafts(
                      selectedScenario.serviceSequence ?? [],
                    ),
                  ).map((step, idx, arr) => {
                    const isLast = idx === arr.length - 1;
                    return (
                      <div key={step.stepKey} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-6 w-6 rounded-full border border-border bg-background text-[11px] font-semibold tabular-nums flex items-center justify-center text-muted-foreground">
                            {step.order}
                          </div>
                          {!isLast ? (
                            <div className="w-px flex-1 bg-border mt-1 min-h-[8px]" />
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="font-mono text-[11px] text-primary">
                            {runStepCaseIdLabel(step)}
                          </div>
                          <div
                            className="text-xs text-muted-foreground mt-0.5 line-clamp-2"
                            title={step.title}
                          >
                            {step.title}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {countBindingRows(
              selectedScenario.stepBindingsByStepKey ??
                selectedScenario.stepBindingsByCode,
            ) > 0 ? (
              <div className="rounded-sm border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                단계 연결{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {countBindingRows(
                    selectedScenario.stepBindingsByStepKey ??
                      selectedScenario.stepBindingsByCode,
                  )}
                  건
                </span>
              </div>
            ) : null}

            {selectedScenario.description?.trim() ? (
              <div className="rounded-sm border border-border bg-card p-4">
                <div className="text-sm font-medium">설명</div>
                <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                  {selectedScenario.description}
                </p>
              </div>
            ) : null}

            {(selectedScenario.tags ?? []).length > 0 ? (
              <div className="rounded-sm border border-border bg-card p-4">
                <div className="text-sm font-medium">태그</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedScenario.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex px-2 py-0.5 rounded-sm text-[11px] font-medium bg-muted text-muted-foreground border border-border"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-sm border border-dashed border-border bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
            시나리오를 선택하면 실행 순서와 연결 정보가 표시됩니다.
          </div>
        )}
      </div>
    </aside>
  );
}

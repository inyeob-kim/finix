import { X } from "lucide-react";
import type { ScenarioRegistryItem } from "../types";
import { countBindingRows } from "@/lib/scenarioBindings";
import {
  buildRunStepsFromPicks,
  runStepCaseIdLabel,
  runStepShortDescription,
  serviceNameMapFromDrafts,
} from "@/lib/scenarioRunSequence";
import {
  FinixDotCanvas,
  FinixFlowPill,
  FinixFlowStepCard,
} from "../../ui/finix-flow";
import { cn } from "../../ui/utils";

export function ScenarioPreviewPanel({
  selectedScenario,
  onClose,
}: {
  selectedScenario: ScenarioRegistryItem | null;
  onClose: () => void;
}) {
  const steps = selectedScenario
    ? buildRunStepsFromPicks(
        selectedScenario.selectedRuleTestcases ?? [],
        serviceNameMapFromDrafts(selectedScenario.serviceSequence ?? []),
      )
    : [];

  const bindingCount = selectedScenario
    ? countBindingRows(
        selectedScenario.stepBindingsByStepKey ??
          selectedScenario.stepBindingsByCode,
      )
    : 0;

  return (
    <aside
      className={cn(
        "flex w-full flex-col border-border bg-card lg:w-1/2 lg:shrink-0",
        "border-t lg:border-l lg:border-t-0",
        "max-h-[min(70vh,800px)] lg:max-h-none lg:min-h-0",
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border bg-muted/20 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">시나리오 미리보기</p>
          {selectedScenario ? (
            <p className="mt-0.5 line-clamp-2 text-sm font-medium text-foreground">
              {selectedScenario.title}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="미리보기 패널 닫기"
          className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selectedScenario ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                테스트 케이스 {steps.length}개
              </span>
              <span className="text-xs text-muted-foreground">
                {selectedScenario.updatedAt} · {selectedScenario.updatedBy}
              </span>
            </div>

            <FinixDotCanvas className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <FinixFlowPill tone="loop">Loop</FinixFlowPill>
                <span className="text-[11px] text-muted-foreground">
                  테스트 케이스 플로우
                </span>
              </div>

              {steps.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  등록 시 선택한 테스트 케이스가 없습니다.
                </p>
              ) : (
                <div className="flex flex-col items-stretch gap-0">
                  <div className="flex justify-center">
                    <FinixFlowPill tone="start">Start</FinixFlowPill>
                  </div>
                  <div className="mx-auto my-1 h-5 w-px bg-primary/50" />
                  <div className="flex flex-col items-stretch gap-0 rounded-md border border-flow-loop/40 bg-card/70 p-3">
                    {steps.map((step, idx) => (
                      <div
                        key={step.stepKey}
                        className="flex flex-col items-stretch"
                      >
                        <FinixFlowStepCard
                          order={step.order}
                          title={runStepCaseIdLabel(step)}
                          subtitle={
                            runStepShortDescription(step) ||
                            step.title?.trim() ||
                            step.serviceCode
                          }
                          className="w-full min-w-0 max-w-none"
                        />
                        {idx < steps.length - 1 ? (
                          <div className="mx-auto my-2 h-5 w-px shrink-0 bg-primary/40" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="mx-auto my-1 h-5 w-px bg-primary/50" />
                  <div className="flex justify-center">
                    <FinixFlowPill tone="end">End</FinixFlowPill>
                  </div>
                </div>
              )}
            </FinixDotCanvas>

            {bindingCount > 0 ? (
              <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                단계 연결{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {bindingCount}건
                </span>
              </div>
            ) : null}

            {selectedScenario.description?.trim() ? (
              <div className="rounded-md border border-border bg-card p-3">
                <div className="text-sm font-medium">설명</div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {selectedScenario.description}
                </p>
              </div>
            ) : null}

            {(selectedScenario.tags ?? []).length > 0 ? (
              <div className="rounded-md border border-border bg-card p-3">
                <div className="text-sm font-medium">태그</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedScenario.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex rounded-sm border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <FinixDotCanvas className="px-4 py-8 text-center text-sm text-muted-foreground">
            시나리오를 선택하면 실행 순서와 연결 정보가 표시됩니다.
          </FinixDotCanvas>
        )}
      </div>
    </aside>
  );
}

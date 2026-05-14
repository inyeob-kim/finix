import { PanelRightClose } from "lucide-react";
import type { ScenarioRegistryItem } from "../types";
import { calcEdgeCases, hash01 } from "../utils";

export function ScenarioPreviewPanel({
  previewCollapsed,
  setPreviewCollapsed,
  selectedScenario,
}: {
  previewCollapsed: boolean;
  setPreviewCollapsed: (v: boolean) => void;
  selectedScenario: ScenarioRegistryItem | null;
}) {
  return (
    <div
      className={[
        "border-l border-border bg-background/60 hidden lg:block overflow-auto transition-[width] duration-200",
        previewCollapsed ? "w-0 p-0 border-l-0" : "w-[360px] p-4",
      ].join(" ")}
    >
      {previewCollapsed ? null : selectedScenario ? (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">Scenario Preview</div>
              <button
                type="button"
                className="h-8 w-8 inline-flex items-center justify-center rounded-sm border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Preview 접기"
                onClick={() => setPreviewCollapsed(true)}
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            </div>
            <div className="text-base font-semibold leading-snug mt-1">
              {selectedScenario.title}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              마지막 수정: {selectedScenario.updatedAt} · {selectedScenario.updatedBy}
            </div>
          </div>

          <div className="rounded-sm border border-border bg-card p-4 shadow-sm space-y-2">
            <div className="text-sm font-medium">Service Flow</div>
            {(selectedScenario.serviceSequence ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground">—</div>
            ) : (
              <div className="space-y-2">
                {(selectedScenario.serviceSequence ?? []).map((s, idx) => {
                  const isLast =
                    idx === (selectedScenario.serviceSequence?.length ?? 0) - 1;
                  return (
                    <div key={`${s.code}-${idx}`} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-6 w-6 rounded-full border border-border bg-background text-[11px] font-semibold tabular-nums flex items-center justify-center text-muted-foreground">
                          {idx + 1}
                        </div>
                        {!isLast ? (
                          <div className="w-px flex-1 bg-border mt-1" />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="inline-flex items-center gap-2 px-2 py-1 rounded-sm border border-border bg-background text-xs w-full">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {s.code}
                          </span>
                          <span className="truncate">{s.name}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-sm border border-border bg-card p-4 space-y-3 shadow-sm">
            <div className="text-sm font-medium">요약</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-sm border border-border bg-background px-3 py-2">
                <div className="text-[11px] text-muted-foreground">Services</div>
                <div className="font-semibold tabular-nums">
                  {(selectedScenario.serviceSequence ?? []).length}
                </div>
              </div>
              <div className="rounded-sm border border-border bg-background px-3 py-2">
                <div className="text-[11px] text-muted-foreground">APIs</div>
                <div className="font-semibold tabular-nums">
                  {(selectedScenario.serviceSequence ?? []).length}
                </div>
              </div>
              <div className="rounded-sm border border-border bg-background px-3 py-2">
                <div className="text-[11px] text-muted-foreground">Success</div>
                <div className="font-semibold tabular-nums">
                  {selectedScenario.status === "active" ? 92 : 75}%
                </div>
              </div>
              <div className="rounded-sm border border-border bg-background px-3 py-2">
                <div className="text-[11px] text-muted-foreground">Coverage</div>
                <div className="font-semibold tabular-nums">
                  {60 +
                    Math.min(
                      35,
                      (selectedScenario.serviceSequence?.length ?? 0) * 8,
                    )}
                  %
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              AI 추천 edge case:{" "}
              <span className="font-semibold text-foreground">
                +{calcEdgeCases(selectedScenario.serviceSequence?.length ?? 0)}
              </span>
            </div>
          </div>

          <div className="rounded-sm border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="text-sm font-medium">Execution Metrics</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-sm border border-border bg-background px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  Avg Response
                </div>
                <div className="font-semibold tabular-nums">
                  {Math.round(120 + hash01(selectedScenario.id) * 420)}ms
                </div>
              </div>
              <div className="rounded-sm border border-border bg-background px-3 py-2">
                <div className="text-[11px] text-muted-foreground">Failed APIs</div>
                <div className="font-semibold tabular-nums">
                  {Math.max(
                    0,
                    Math.round((100 - (selectedScenario.status === "active" ? 92 : 75)) / 12),
                  )}
                </div>
              </div>
              <div className="rounded-sm border border-border bg-background px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  Validation Score
                </div>
                <div className="font-semibold tabular-nums">
                  {Math.round(78 + hash01(selectedScenario.updatedAt) * 18)}%
                </div>
              </div>
              <div className="rounded-sm border border-border bg-background px-3 py-2">
                <div className="text-[11px] text-muted-foreground">Auto Checks</div>
                <div className="font-semibold tabular-nums">
                  {Math.round(6 + (selectedScenario.serviceSequence?.length ?? 0) * 2)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="text-sm font-medium">AI Insights</div>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" />
                Missing edge-case detected in input boundary set.
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" />
                Retry scenario recommended (flaky endpoint pattern).
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" />
                Coverage can be improved by +{calcEdgeCases(selectedScenario.serviceSequence?.length ?? 0)} cases.
              </li>
            </ul>
          </div>

          <div className="rounded-sm border border-border bg-card p-4 shadow-sm">
            <div className="text-sm font-medium">설명</div>
            <div className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
              {selectedScenario.description || "—"}
            </div>
          </div>

          <div className="rounded-sm border border-border bg-card p-4 shadow-sm">
            <div className="text-sm font-medium">태그</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(selectedScenario.tags ?? []).slice(0, 8).map((t) => (
                <span
                  key={t}
                  className="inline-flex px-2 py-0.5 rounded-sm text-[11px] font-medium bg-muted text-muted-foreground border border-border"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">Scenario Preview</div>
            <button
              type="button"
              className="h-8 w-8 inline-flex items-center justify-center rounded-sm border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Preview 접기"
              onClick={() => setPreviewCollapsed(true)}
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
          <div className="rounded-sm border border-dashed border-border bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
            시나리오를 선택하면 우측에 상세 미리보기가 표시됩니다.
          </div>
        </div>
      )}
    </div>
  );
}


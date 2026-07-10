import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ExecutionStepViewModel } from "@/lib/executionStepView";
import { ExecutionJsonPanel } from "./ExecutionJsonPanel";

type Props = {
  step: ExecutionStepViewModel;
  changesOnly: boolean;
  embedded?: boolean;
};

export function ExecutionStepDetailPanel({ step, changesOnly, embedded = false }: Props) {
  const [showTemplate, setShowTemplate] = useState(false);
  const contextEntries = Object.entries(step.contextAfter);

  return (
    <div
      className={
        embedded
          ? "space-y-4"
          : "mt-3 rounded-sm border border-border bg-secondary/30 p-3 space-y-4"
      }
    >
      {contextEntries.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-muted-foreground">
            실행 컨텍스트 (단계 후)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {contextEntries.map(([key, val]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-border bg-background text-[10px] font-mono"
              >
                <span className="text-emerald-700 dark:text-emerald-400">
                  {key}
                </span>
                <span className="text-muted-foreground">=</span>
                <span className="truncate max-w-[120px]">
                  {typeof val === "string"
                    ? val
                    : JSON.stringify(val).replace(/\s+/g, " ").slice(0, 40)}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium text-muted-foreground">
            요청 body (실행 시)
          </div>
          {!changesOnly ? (
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              onClick={() => setShowTemplate((v) => !v)}
            >
              템플릿 {showTemplate ? "숨기기" : "보기"}
              {showTemplate ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
          ) : null}
        </div>
        <ExecutionJsonPanel
          label="resolved"
          value={step.resolvedRequestBody}
          compareWith={step.templateRequestBody}
          changesOnly={changesOnly}
          highlightPaths={step.injectedKeys}
          tone="default"
          emptyMessage="inject 변경 없음"
        />
        {!changesOnly && showTemplate ? (
          <ExecutionJsonPanel
            label="template"
            value={step.templateRequestBody}
            tone="muted"
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <ExecutionJsonPanel
          label="예상 응답 body"
          value={step.expectedBody}
          compareWith={step.actualBody}
          changesOnly={changesOnly}
          tone="success"
          emptyMessage="예상과 동일"
        />
        <ExecutionJsonPanel
          label="실제 응답 body"
          value={step.actualBody}
          compareWith={step.expectedBody}
          changesOnly={changesOnly}
          tone={step.status === "passed" ? "default" : "danger"}
          emptyMessage="예상과 동일"
        />
      </div>
    </div>
  );
}

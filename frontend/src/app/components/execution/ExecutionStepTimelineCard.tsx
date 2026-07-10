import { useState } from "react";
import {
  ArrowDown,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  XCircle,
} from "lucide-react";
import type { ExecutionStepViewModel } from "@/lib/executionStepView";
import { ExecutionJsonPanel } from "./ExecutionJsonPanel";
import { cn } from "../ui/utils";

type Props = {
  step: ExecutionStepViewModel;
  displayIndex: number;
  expanded: boolean;
  onToggle: () => void;
  showConnector: boolean;
  changesOnly?: boolean;
};

export function ExecutionStepTimelineCard({
  step,
  displayIndex,
  expanded,
  onToggle,
  showConnector,
  changesOnly = false,
}: Props) {
  const [showTemplate, setShowTemplate] = useState(false);
  const contextEntries = Object.entries(step.contextAfter);
  const httpLine =
    step.requestUrl ||
    [step.method, step.endpoint].filter(Boolean).join(" ") ||
    null;

  return (
    <div>
      <div
        className={cn(
          "rounded-sm border overflow-hidden shadow-sm transition-colors",
          step.status === "passed"
            ? "border-border bg-card"
            : "border-destructive/30 bg-card",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-start justify-between gap-3 p-4 hover:bg-accent/5 transition-colors text-left"
        >
          <div className="flex items-start gap-3 min-w-0">
            {step.status === "passed" ? (
              <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground tabular-nums">
                  [{displayIndex + 1}]
                </span>
                <h4 className="text-sm font-medium line-clamp-2">{step.label}</h4>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium",
                    step.status === "passed"
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {step.status === "passed" ? "성공" : "실패"}
                </span>
              </div>
              {httpLine ? (
                <p className="text-[11px] font-mono text-muted-foreground truncate">
                  {step.method ? (
                    <span className="text-primary mr-1.5">{step.method}</span>
                  ) : null}
                  {httpLine}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">HTTP</span>
                <span
                  className={cn(
                    "font-mono px-1.5 py-0.5 rounded",
                    step.statusMatch
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {step.actualStatus ?? "—"}
                </span>
                {step.expectedStatus != null ? (
                  <span className="text-muted-foreground">
                    / 예상 {step.expectedStatus}
                  </span>
                ) : null}
              </div>
              {step.errorMessage ? (
                <p className="text-xs text-destructive">{step.errorMessage}</p>
              ) : null}
              {step.injectedKeys.length > 0 ? (
                <p className="text-[10px] text-amber-800 dark:text-amber-200">
                  inject: {step.injectedKeys.join(", ")}
                </p>
              ) : null}
            </div>
          </div>
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          )}
        </button>

        {expanded ? (
          <div className="border-t border-border p-4 space-y-4 bg-secondary/40">
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
        ) : null}
      </div>
      {showConnector ? (
        <div className="flex justify-center py-1 text-muted-foreground/40">
          <ArrowDown className="w-4 h-4" />
        </div>
      ) : null}
    </div>
  );
}

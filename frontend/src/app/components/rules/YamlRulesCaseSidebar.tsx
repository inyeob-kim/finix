import { Play } from "lucide-react";
import { getCaseId, type YamlRuleRecord } from "@/lib/yamlRulesDocument";
import { FINIX_YAML_CASE_SIDEBAR_WIDTH } from "@/lib/finixModalLayout";
import { cn } from "../ui/utils";
import { CaseTypeBadge, ruleListLabel } from "./yamlCaseListUi";

type Props = {
  rules: YamlRuleRecord[];
  /** Document indices in display order (N then E). Defaults to 0..n-1. */
  displayIndices?: number[];
  disabled?: boolean;
  runningCaseId?: string | null;
  editingDocument: boolean;
  selectedRuleIndex: number;
  caseHasLocalError: boolean;
  onSelectDocument: () => void;
  onSelectRule: (index: number) => void;
  onRunCase?: (caseId: string, ruleIndex: number) => void;
};

export function YamlRulesCaseSidebar({
  rules,
  displayIndices,
  disabled = false,
  runningCaseId = null,
  editingDocument,
  selectedRuleIndex,
  caseHasLocalError,
  onSelectDocument,
  onSelectRule,
  onRunCase,
}: Props) {
  const indices =
    displayIndices && displayIndices.length === rules.length
      ? displayIndices
      : rules.map((_, index) => index);

  return (
    <aside
      className={cn(
        FINIX_YAML_CASE_SIDEBAR_WIDTH,
        "flex flex-col rounded-md border border-border overflow-hidden max-h-40 sm:max-h-none",
      )}
    >
      <p className="px-2.5 py-2 text-[11px] font-medium text-muted-foreground border-b border-border bg-muted/20">
        케이스 {rules.length}건
      </p>
      <ul className="flex-1 min-h-0 overflow-y-auto">
        {indices.map((index) => {
          const rule = rules[index];
          if (!rule || typeof rule !== "object") {
            return (
              <li key={`invalid-${index}`}>
                <button
                  type="button"
                  disabled
                  className="w-full text-left px-2.5 py-2 text-xs text-destructive border-b border-border opacity-70"
                >
                  rules[{index}] 형식 오류
                </button>
              </li>
            );
          }
          const active = !editingDocument && selectedRuleIndex === index;
          const caseId = getCaseId(rule);
          const tags = Array.isArray(rule.tags)
            ? rule.tags.map((t) => String(t)).filter(Boolean).slice(0, 2)
            : [];
          const isRunning = Boolean(caseId && runningCaseId === caseId);
          return (
            <li key={`${caseId || "rule"}-${index}`}>
              <div
                className={cn(
                  "flex items-stretch border-b border-border",
                  active ? "bg-primary/10" : "hover:bg-muted/40",
                )}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectRule(index)}
                  className={cn(
                    "min-w-0 flex-1 text-left px-2.5 py-2 transition-colors",
                    active ? "text-foreground" : "",
                  )}
                >
                  <div className="flex items-start gap-1.5">
                    <CaseTypeBadge ruleType={String(rule.rule_type ?? "")} />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-xs truncate flex items-center gap-1",
                          active ? "font-medium" : "text-foreground",
                        )}
                      >
                        {caseHasLocalError && active ? (
                          <span
                            className="size-1.5 rounded-full bg-destructive shrink-0"
                            aria-hidden
                          />
                        ) : null}
                        {ruleListLabel(rule, index)}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                        {caseId || `#${index + 1}`}
                        {tags.length > 0 ? ` · ${tags.join(", ")}` : ""}
                      </p>
                    </div>
                  </div>
                </button>
                {onRunCase && caseId ? (
                  <button
                    type="button"
                    disabled={disabled || isRunning}
                    title="이 케이스 테스트 실행"
                    aria-label={`${caseId} 실행`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRunCase(caseId, index);
                    }}
                    className={cn(
                      "shrink-0 px-2 text-muted-foreground hover:text-primary disabled:opacity-40",
                      isRunning && "text-primary",
                    )}
                  >
                    <Play
                      className={cn("size-3.5", isRunning && "animate-pulse")}
                      fill="currentColor"
                    />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
        {rules.length === 0 ? (
          <li className="px-2.5 py-3 text-[11px] text-muted-foreground">
            케이스가 없습니다. 필드 탭에서 추가하거나 소스에서 생성하세요.
          </li>
        ) : null}
      </ul>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelectDocument}
        className={cn(
          "w-full text-left px-2.5 py-1.5 text-[10px] border-t border-border transition-colors",
          editingDocument
            ? "bg-muted/50 text-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/30",
        )}
      >
        원문 YAML (고급)
      </button>
    </aside>
  );
}

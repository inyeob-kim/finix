import { getCaseId, type YamlRuleRecord } from "@/lib/yamlRulesDocument";
import { cn } from "../ui/utils";
import { CaseTypeBadge, ruleListLabel } from "./yamlCaseListUi";

type Props = {
  rules: YamlRuleRecord[];
  /** Document indices in display order (N then E). Defaults to 0..n-1. */
  displayIndices?: number[];
  disabled?: boolean;
  editingDocument: boolean;
  selectedRuleIndex: number;
  caseHasLocalError: boolean;
  onSelectDocument: () => void;
  onSelectRule: (index: number) => void;
};

export function YamlRulesCaseSidebar({
  rules,
  displayIndices,
  disabled = false,
  editingDocument,
  selectedRuleIndex,
  caseHasLocalError,
  onSelectDocument,
  onSelectRule,
}: Props) {
  const indices =
    displayIndices && displayIndices.length === rules.length
      ? displayIndices
      : rules.map((_, index) => index);

  return (
    <aside className="sm:w-56 shrink-0 flex flex-col rounded-md border border-border overflow-hidden max-h-40 sm:max-h-none">
      <p className="px-2.5 py-2 text-[11px] font-medium text-muted-foreground border-b border-border bg-muted/20">
        케이스 {rules.length}건
      </p>
      <ul className="flex-1 min-h-0 overflow-y-auto">
        <li>
          <button
            type="button"
            disabled={disabled}
            onClick={onSelectDocument}
            className={cn(
              "w-full text-left px-2.5 py-2 text-xs border-b border-border transition-colors",
              editingDocument
                ? "bg-primary/10 text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            전체 문서
          </button>
        </li>
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
          const active = selectedRuleIndex === index;
          const caseId = getCaseId(rule);
          const tags = Array.isArray(rule.tags)
            ? rule.tags.map((t) => String(t)).filter(Boolean).slice(0, 2)
            : [];
          return (
            <li key={`${caseId || "rule"}-${index}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelectRule(index)}
                className={cn(
                  "w-full text-left px-2.5 py-2 border-b border-border transition-colors",
                  active ? "bg-primary/10 text-foreground" : "hover:bg-muted/40",
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
            </li>
          );
        })}
        {rules.length === 0 ? (
          <li className="px-2.5 py-3 text-[11px] text-muted-foreground">
            rules가 비어 있습니다. 전체 문서에서 작성하거나 입력/기대값 탭에서
            추가하세요.
          </li>
        ) : null}
      </ul>
    </aside>
  );
}

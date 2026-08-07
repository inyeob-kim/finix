import type { ServiceRuleCaseMetaDto } from "@/api/types";
import { cn } from "../ui/utils";

type YamlRulesCaseApplyToggleProps = {
  caseId: string;
  meta?: ServiceRuleCaseMetaDto;
  disabled?: boolean;
  toggling?: boolean;
  /** Block activate until editor YAML is saved. */
  applyNeedsSave?: boolean;
  onToggle?: (caseId: string) => void;
  className?: string;
};

export function YamlRulesCaseApplyToggle({
  caseId,
  meta,
  disabled = false,
  toggling = false,
  applyNeedsSave = false,
  onToggle,
  className,
}: YamlRulesCaseApplyToggleProps) {
  const isApplied = meta?.is_applied ?? false;
  const canActivate = meta?.has_draft ?? false;
  const hasPoolTestcase = meta?.has_pool_testcase ?? false;

  const toggleDisabled =
    disabled ||
    toggling ||
    (!isApplied && (!canActivate || applyNeedsSave || !hasPoolTestcase));

  const title = isApplied
    ? "시나리오 사용 해제 (비확정)"
    : applyNeedsSave || !canActivate
      ? "저장 후 확정할 수 있습니다"
      : !hasPoolTestcase
        ? "▶ 실행 또는 TC 풀 생성 후 확정할 수 있습니다"
        : "시나리오에서 사용 (확정)";

  return (
    <button
      type="button"
      disabled={toggleDisabled}
      title={title}
      aria-label={isApplied ? `${caseId} 비확정` : `${caseId} 확정`}
      aria-pressed={isApplied}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.(caseId);
      }}
      className={cn(
        "mr-2 shrink-0 h-6 px-1.5 rounded-sm text-[10px] font-medium leading-none",
        "inline-flex items-center justify-center transition-colors",
        "disabled:opacity-40 disabled:pointer-events-none",
        isApplied
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-primary",
        toggling && "animate-pulse",
        className,
      )}
    >
      확정
    </button>
  );
}

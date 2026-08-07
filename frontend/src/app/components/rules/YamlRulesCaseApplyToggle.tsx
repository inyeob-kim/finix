import type { ServiceRuleCaseMetaDto } from "@/api/types";
import { Check } from "lucide-react";
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
        ? "케이스 옆 올리기 또는 TC 풀·실행 탭 「풀에 반영」 후 확정할 수 있습니다"
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
        "shrink-0 inline-flex items-center justify-center transition-colors",
        "disabled:pointer-events-none disabled:hover:bg-transparent",
        className,
        toggleDisabled
          ? "text-muted-foreground/40"
          : isApplied
            ? "text-primary"
            : "text-muted-foreground hover:text-primary",
        toggling && "animate-pulse",
      )}
    >
      <Check className="size-3.5" aria-hidden />
    </button>
  );
}

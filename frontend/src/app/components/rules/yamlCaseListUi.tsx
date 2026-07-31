import {
  getCaseId,
  normalizeCaseType,
  type YamlRuleRecord,
} from "@/lib/yamlRulesDocument";
import { cn } from "../ui/utils";

export function ruleListLabel(rule: YamlRuleRecord, index: number): string {
  const title = String(rule.title ?? "").trim();
  if (title) return title;
  const caseId = getCaseId(rule);
  if (caseId) return caseId;
  return `규칙 ${index + 1}`;
}

export function CaseTypeBadge({ ruleType }: { ruleType: string | undefined }) {
  const t = normalizeCaseType(ruleType);
  return (
    <span
      className={cn(
        "shrink-0 px-1.5 py-0.5 rounded-sm text-[10px] font-medium border",
        t === "E"
          ? "bg-destructive/10 text-destructive border-destructive/30"
          : "bg-emerald-50 text-emerald-900 border-emerald-200",
      )}
    >
      {t}
    </span>
  );
}

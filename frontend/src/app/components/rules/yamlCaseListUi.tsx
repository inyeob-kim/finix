import {
  getCaseId,
  normalizeCaseType,
  type YamlRuleRecord,
} from "@/lib/yamlRulesDocument";
import { FinixStatusBadge } from "../ui/finix-status-badge";

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
    <FinixStatusBadge tone={t === "E" ? "danger" : "success"}>{t}</FinixStatusBadge>
  );
}

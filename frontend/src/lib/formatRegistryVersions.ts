import type { RuleRegistryItem } from "@/hooks/useRulesRegistry";

/** Short label for registry row status (no version numbers). */
export function formatRegistryVersionSummary(item: RuleRegistryItem): string {
  if (item.hasDraft) return "작업 중";
  if (item.activeBundleVersion != null || item.isActive) return "적용됨";
  return "—";
}

/** Tooltip for the workflow status pill. */
export function registryStatusHint(item: RuleRegistryItem): string | undefined {
  if (item.hasDraft && (item.activeBundleVersion != null || item.isActive)) {
    return "작업 중 · 적용됨(이전 적용본 유지)";
  }
  if (item.hasDraft) {
    return "작업 중 (아직 미적용)";
  }
  if (item.activeBundleVersion != null || item.isActive) {
    return "적용됨 — 테스트케이스 생성에 사용";
  }
  return undefined;
}

/** Tooltip for the history column. */
export function registryVersionHint(item: RuleRegistryItem): string | undefined {
  if (item.versionCount <= 0) {
    return undefined;
  }
  const parts: string[] = [];
  if (item.hasDraft) parts.push("작업본 있음");
  if (item.activeBundleVersion != null || item.isActive) parts.push("적용됨");
  parts.push(`이력 ${item.versionCount}건`);
  return parts.join(" · ");
}

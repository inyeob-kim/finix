import type { RuleRegistryItem } from "@/hooks/useRulesRegistry";

/** Primary (latest edit target) version for the registry table. */
export function formatRegistryVersionSummary(item: RuleRegistryItem): string {
  return `v${item.bundleVersion}`;
}

/** Tooltip for the workflow status pill. */
export function registryStatusHint(item: RuleRegistryItem): string | undefined {
  if (
    item.draftBundleVersion != null &&
    item.activeBundleVersion != null &&
    item.draftBundleVersion !== item.activeBundleVersion
  ) {
    return `작업 중 v${item.draftBundleVersion} · 운영 v${item.activeBundleVersion}`;
  }
  if (item.activeBundleVersion != null && item.status === "active") {
    return `운영 v${item.activeBundleVersion}`;
  }
  if (item.draftBundleVersion != null) {
    return `Draft v${item.draftBundleVersion}`;
  }
  return undefined;
}

/** Tooltip for the version column when multiple bundles exist. */
export function registryVersionHint(item: RuleRegistryItem): string | undefined {
  if (item.versionCount <= 1) {
    return undefined;
  }
  const parts: string[] = [`편집 대상 v${item.bundleVersion}`];
  if (
    item.activeBundleVersion != null &&
    item.activeBundleVersion !== item.bundleVersion
  ) {
    parts.push(`운영 v${item.activeBundleVersion}`);
  }
  parts.push(`총 ${item.versionCount}개 버전`);
  return parts.join(" · ");
}

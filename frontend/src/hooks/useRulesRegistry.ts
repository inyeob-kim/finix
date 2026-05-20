import { useCallback, useEffect, useState } from "react";
import {
  listAllServiceRulesRegistry,
  type ServiceRuleRegistryItemDto,
} from "@/api/serviceRulesApi";
import { ApiError } from "@/api/client";
import type { ServiceRuleBundleReadDto } from "@/api/types";

export type RuleRegistryItem = {
  serviceCode: string;
  serviceName: string;
  sourceVersion: string;
  status: string;
  rules: number;
  bundleId: number;
  bundleVersion: number;
  lastUpdatedAt: string;
  lastUpdatedBy: string;
  isActive: boolean;
  versionCount: number;
  activeBundleVersion: number | null;
  draftBundleVersion: number | null;
  hasApproved: boolean;
};

export function mapRegistryRow(r: ServiceRuleRegistryItemDto): RuleRegistryItem {
  const at = r.last_updated_at
    ? new Date(r.last_updated_at)
        .toLocaleString("sv-SE", { hour12: false })
        .replace("T", " ")
    : "—";
  return {
    serviceCode: r.service_code,
    serviceName: r.service_name,
    sourceVersion: r.source_version ?? "—",
    status: r.status,
    rules: r.rules,
    bundleId: r.bundle_id,
    bundleVersion: r.bundle_version,
    lastUpdatedAt: at,
    lastUpdatedBy: r.last_updated_by ?? "—",
    isActive: r.is_active,
    versionCount: r.version_count ?? 0,
    activeBundleVersion: r.active_bundle_version ?? null,
    draftBundleVersion: r.draft_bundle_version ?? null,
    hasApproved: r.has_approved ?? false,
  };
}

/** Merge API bundle + optional registry row into the open edit-modal selection. */
export function mergeSelectedWithBundle(
  prev: RuleRegistryItem,
  bundle: ServiceRuleBundleReadDto,
  registryRow?: RuleRegistryItem | null,
): RuleRegistryItem {
  const rulesArr =
    bundle.rules && Array.isArray((bundle.rules as { rules?: unknown }).rules)
      ? (bundle.rules as { rules: unknown[] }).rules
      : null;
  const base = registryRow ?? prev;
  const status = bundle.status ?? prev.status;
  const isActive =
    bundle.is_active ?? status.toLowerCase() === "active";
  return {
    ...base,
    bundleId: bundle.id,
    bundleVersion: bundle.version,
    status,
    rules: rulesArr?.length ?? base.rules,
    sourceVersion: bundle.source_version ?? base.sourceVersion,
    isActive,
    activeBundleVersion: isActive
      ? bundle.version
      : base.activeBundleVersion,
  };
}

export function useRulesRegistry(params: {
  query: string;
  statusFilter: string;
}) {
  const [registry, setRegistry] = useState<RuleRegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState(params.query);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(params.query), 300);
    return () => window.clearTimeout(t);
  }, [params.query]);

  const load = useCallback(async (): Promise<RuleRegistryItem[]> => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAllServiceRulesRegistry({
        query: debouncedQuery.trim() || undefined,
        status: params.statusFilter || undefined,
      });
      const mapped = res.items.map(mapRegistryRow);
      setRegistry(mapped);
      return mapped;
    } catch (e) {
      setRegistry([]);
      setError(
        e instanceof ApiError ? e.message : "규칙 목록을 불러오지 못했습니다.",
      );
      return [];
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, params.statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = registry.filter((r) => r.activeBundleVersion != null).length;
  const draftCount = registry.filter((r) => r.draftBundleVersion != null).length;

  return { registry, loading, error, load, activeCount, draftCount };
}

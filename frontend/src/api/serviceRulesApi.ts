import { apiRequest } from "./client";
import type { ServiceRuleBundleReadDto } from "./types";

export interface ServiceRuleRegistryItemDto {
  service_code: string;
  service_name: string;
  source_version: string | null;
  status: string;
  rules: number;
  bundle_id: number;
  bundle_version: number;
  last_updated_at: string | null;
  last_updated_by: string | null;
  is_active: boolean;
  version_count: number;
  active_bundle_version: number | null;
  draft_bundle_version: number | null;
  has_approved: boolean;
}

export interface ServiceRuleRegistryListDto {
  items: ServiceRuleRegistryItemDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface ServiceRuleValidateYamlResultDto {
  ok: true;
  service_name: string | null;
  rule_count: number;
}

const REGISTRY_PAGE_SIZE = 200;

export async function listServiceRulesRegistry(params?: {
  query?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<ServiceRuleRegistryListDto> {
  const q = new URLSearchParams();
  if (params?.query) q.set("query", params.query);
  if (params?.status) q.set("status", params.status);
  const limit = Math.min(params?.limit ?? REGISTRY_PAGE_SIZE, REGISTRY_PAGE_SIZE);
  q.set("limit", String(limit));
  q.set("offset", String(params?.offset ?? 0));
  const qs = q.toString();
  return apiRequest<ServiceRuleRegistryListDto>(
    `/api/v1/service-rules/registry${qs ? `?${qs}` : ""}`,
    { method: "GET" },
  );
}

/** Fetch all registry rows (paginated requests; API max limit is 200). */
export async function listAllServiceRulesRegistry(params?: {
  query?: string;
  status?: string;
}): Promise<ServiceRuleRegistryListDto> {
  const all: ServiceRuleRegistryItemDto[] = [];
  let offset = 0;
  let total = 0;

  for (;;) {
    const page = await listServiceRulesRegistry({
      query: params?.query,
      status: params?.status,
      limit: REGISTRY_PAGE_SIZE,
      offset,
    });
    all.push(...page.items);
    total = page.total;
    offset += REGISTRY_PAGE_SIZE;
    if (page.items.length < REGISTRY_PAGE_SIZE || all.length >= total) {
      break;
    }
  }

  return {
    items: all,
    total,
    limit: all.length,
    offset: 0,
  };
}

export async function getActiveServiceRules(
  serviceCode: string,
): Promise<ServiceRuleBundleReadDto | null> {
  return apiRequest<ServiceRuleBundleReadDto | null>(
    `/api/v1/service-rules/${encodeURIComponent(serviceCode)}`,
    { method: "GET" },
  );
}

export async function getServiceRulesBundle(
  serviceCode: string,
  bundleId: number,
): Promise<ServiceRuleBundleReadDto> {
  return apiRequest<ServiceRuleBundleReadDto>(
    `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/bundles/${bundleId}`,
    { method: "GET" },
  );
}

export async function deleteServiceRulesBundle(
  serviceCode: string,
  bundleId: number,
): Promise<void> {
  await apiRequest<void>(
    `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/bundles/${bundleId}`,
    { method: "DELETE" },
  );
}

export async function listServiceRulesVersions(
  serviceCode: string,
): Promise<ServiceRuleBundleReadDto[]> {
  return apiRequest<ServiceRuleBundleReadDto[]>(
    `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/versions`,
    { method: "GET" },
  );
}

export async function createServiceRulesDraft(
  serviceCode: string,
  payload: {
    yaml_text: string;
    source_version?: string | null;
    created_by?: string | null;
  },
): Promise<ServiceRuleBundleReadDto> {
  return apiRequest<ServiceRuleBundleReadDto>(
    `/api/v1/service-rules/${encodeURIComponent(serviceCode)}`,
    {
      method: "POST",
      body: JSON.stringify({
        yaml_text: payload.yaml_text,
        source_version: payload.source_version ?? null,
        created_by: payload.created_by ?? null,
      }),
    },
  );
}

export async function updateServiceRulesDraft(
  serviceCode: string,
  bundleId: number,
  payload: {
    yaml_text: string;
    source_version?: string | null;
    created_by?: string | null;
  },
): Promise<ServiceRuleBundleReadDto> {
  return apiRequest<ServiceRuleBundleReadDto>(
    `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/bundles/${bundleId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        yaml_text: payload.yaml_text,
        source_version: payload.source_version ?? null,
        created_by: payload.created_by ?? null,
      }),
    },
  );
}

export async function validateServiceRulesYaml(
  serviceCode: string,
  yamlText: string,
): Promise<ServiceRuleValidateYamlResultDto> {
  return apiRequest<ServiceRuleValidateYamlResultDto>(
    `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/validate-yaml`,
    {
      method: "POST",
      body: JSON.stringify({ yaml_text: yamlText }),
    },
  );
}

export async function approveServiceRulesBundle(
  serviceCode: string,
  bundleId: number,
): Promise<ServiceRuleBundleReadDto> {
  return apiRequest<ServiceRuleBundleReadDto>(
    `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/${bundleId}/approve`,
    { method: "POST" },
  );
}

export async function activateServiceRulesBundle(
  serviceCode: string,
  bundleId: number,
): Promise<ServiceRuleBundleReadDto> {
  return apiRequest<ServiceRuleBundleReadDto>(
    `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/${bundleId}/activate`,
    { method: "POST" },
  );
}

export async function generateServiceRulesDraftFromSource(
  serviceCode: string,
  payload: {
    source_code: string;
    source_version?: string | null;
    hints?: string | null;
    created_by?: string | null;
  },
): Promise<ServiceRuleBundleReadDto> {
  const path = `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/generate-draft-from-source`;
  return apiRequest<ServiceRuleBundleReadDto>(path, {
    method: "POST",
    body: JSON.stringify({
      source_code: payload.source_code,
      source_version: payload.source_version ?? null,
      hints: payload.hints ?? null,
      created_by: payload.created_by ?? null,
    }),
  });
}

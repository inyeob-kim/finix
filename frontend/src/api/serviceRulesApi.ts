import { apiRequest } from "./client";
import { getRequiredInstCd, withInstCdQuery } from "@/lib/instScope";
import type {
  ServiceRuleBundleReadDto,
  ServiceRuleEditorCasesDto,
} from "./types";

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
  has_draft?: boolean;
  history_count?: number;
  business_domain?: string;
  component_code?: string;
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
  instCd?: string | null;
}): Promise<ServiceRuleRegistryListDto> {
  const q = new URLSearchParams();
  q.set("inst_cd", getRequiredInstCd(params?.instCd));
  if (params?.query) q.set("query", params.query);
  if (params?.status) q.set("status", params.status);
  const limit = Math.min(params?.limit ?? REGISTRY_PAGE_SIZE, REGISTRY_PAGE_SIZE);
  q.set("limit", String(limit));
  q.set("offset", String(params?.offset ?? 0));
  return apiRequest<ServiceRuleRegistryListDto>(
    `/api/v1/service-rules/registry?${q.toString()}`,
    { method: "GET" },
  );
}

/** Fetch all registry rows (paginated requests; API max limit is 200). */
export async function listAllServiceRulesRegistry(params?: {
  query?: string;
  status?: string;
  instCd?: string | null;
}): Promise<ServiceRuleRegistryListDto> {
  const all: ServiceRuleRegistryItemDto[] = [];
  let offset = 0;
  let total = 0;

  for (;;) {
    const page = await listServiceRulesRegistry({
      query: params?.query,
      status: params?.status,
      instCd: params?.instCd,
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

export async function listServiceRuleCases(
  serviceCode: string,
  instCd?: string | null,
): Promise<ServiceRuleEditorCasesDto | null> {
  return apiRequest<ServiceRuleEditorCasesDto | null>(
    withInstCdQuery(
      `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/cases`,
      instCd,
    ),
    { method: "GET" },
  );
}

export async function getActiveServiceRules(
  serviceCode: string,
  instCd?: string | null,
): Promise<ServiceRuleBundleReadDto | null> {
  return apiRequest<ServiceRuleBundleReadDto | null>(
    withInstCdQuery(
      `/api/v1/service-rules/${encodeURIComponent(serviceCode)}`,
      instCd,
    ),
    { method: "GET" },
  );
}

export async function getServiceRulesBundle(
  serviceCode: string,
  bundleId: number,
  instCd?: string | null,
): Promise<ServiceRuleBundleReadDto> {
  return apiRequest<ServiceRuleBundleReadDto>(
    withInstCdQuery(
      `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/bundles/${bundleId}`,
      instCd,
    ),
    { method: "GET" },
  );
}

export async function deleteServiceRulesBundle(
  serviceCode: string,
  bundleId: number,
  instCd?: string | null,
): Promise<void> {
  await apiRequest<void>(
    withInstCdQuery(
      `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/bundles/${bundleId}`,
      instCd,
    ),
    { method: "DELETE" },
  );
}

export async function listServiceRulesVersions(
  serviceCode: string,
  instCd?: string | null,
): Promise<ServiceRuleBundleReadDto[]> {
  return apiRequest<ServiceRuleBundleReadDto[]>(
    withInstCdQuery(
      `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/versions`,
      instCd,
    ),
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
  instCd?: string | null,
): Promise<ServiceRuleBundleReadDto> {
  return apiRequest<ServiceRuleBundleReadDto>(
    withInstCdQuery(
      `/api/v1/service-rules/${encodeURIComponent(serviceCode)}`,
      instCd,
    ),
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
  instCd?: string | null,
): Promise<ServiceRuleBundleReadDto> {
  return apiRequest<ServiceRuleBundleReadDto>(
    withInstCdQuery(
      `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/bundles/${bundleId}`,
      instCd,
    ),
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
  instCd?: string | null,
): Promise<ServiceRuleValidateYamlResultDto> {
  return apiRequest<ServiceRuleValidateYamlResultDto>(
    withInstCdQuery(
      `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/validate-yaml`,
      instCd,
    ),
    {
      method: "POST",
      body: JSON.stringify({ yaml_text: yamlText }),
    },
  );
}

export async function activateServiceRulesBundle(
  serviceCode: string,
  bundleId: number,
  options?: {
    instCd?: string | null;
    autoMaterializeMissing?: boolean;
  },
): Promise<ServiceRuleBundleReadDto> {
  const instCd = options?.instCd;
  const autoMaterializeMissing = options?.autoMaterializeMissing ?? false;
  return apiRequest<ServiceRuleBundleReadDto>(
    withInstCdQuery(
      `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/${bundleId}/activate`,
      instCd,
    ),
    {
      method: "POST",
      body: JSON.stringify({
        auto_materialize_missing: autoMaterializeMissing,
      }),
    },
  );
}

/** Apply one rule case draft → applied (partial 확정). */
export async function applyServiceRuleCase(
  serviceCode: string,
  caseId: string,
  instCd?: string | null,
): Promise<ServiceRuleEditorCasesDto> {
  return apiRequest<ServiceRuleEditorCasesDto>(
    withInstCdQuery(
      `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/cases/${encodeURIComponent(caseId)}/apply`,
      instCd,
    ),
    { method: "POST" },
  );
}

/** Remove one rule case from applied (partial 비확정). */
export async function deactivateServiceRuleCase(
  serviceCode: string,
  caseId: string,
  instCd?: string | null,
): Promise<ServiceRuleEditorCasesDto> {
  return apiRequest<ServiceRuleEditorCasesDto>(
    withInstCdQuery(
      `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/cases/${encodeURIComponent(caseId)}/deactivate`,
      instCd,
    ),
    { method: "POST" },
  );
}

/** Restore applied YAML from a history snapshot (``to_version`` = history id). */
export async function rollbackServiceRules(
  serviceCode: string,
  historyId: number,
  instCd?: string | null,
): Promise<ServiceRuleBundleReadDto> {
  return apiRequest<ServiceRuleBundleReadDto>(
    withInstCdQuery(
      `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/rollback`,
      instCd,
    ),
    {
      method: "POST",
      body: JSON.stringify({ to_version: historyId }),
    },
  );
}

export async function generateServiceRulesDraftFromSource(
  serviceCode: string,
  payload: {
    source_code: string;
    source_version?: string | null;
    hints?: string | null;
    created_by?: string | null;
    use_data_pool?: boolean;
    use_swagger?: boolean;
  },
  instCd?: string | null,
): Promise<ServiceRuleBundleReadDto> {
  const path = withInstCdQuery(
    `/api/v1/service-rules/${encodeURIComponent(serviceCode)}/generate-draft-from-source`,
    instCd,
  );
  return apiRequest<ServiceRuleBundleReadDto>(path, {
    method: "POST",
    body: JSON.stringify({
      source_code: payload.source_code,
      source_version: payload.source_version ?? null,
      hints: payload.hints ?? null,
      created_by: payload.created_by ?? null,
      use_data_pool: payload.use_data_pool ?? false,
      use_swagger: payload.use_swagger ?? false,
    }),
  });
}

export interface PostmanUnmatchedRequestDto {
  name: string;
  method: string;
  path: string;
}

export interface PostmanServiceImportResultDto {
  service_code: string;
  mode: string;
  engine: string;
  draft_id: number;
  diff: {
    updated?: number;
    added?: number;
    kept?: number;
    notes?: string[];
  };
  notes: string[];
}

export interface PostmanRulesImportResultDto {
  services: PostmanServiceImportResultDto[];
  unmatched: PostmanUnmatchedRequestDto[];
  notes?: string[];
}

export interface PostmanRulesImportPreflightDto {
  matched_services: string[];
  draft_services: string[];
  unmatched: PostmanUnmatchedRequestDto[];
  request_count: number;
  notes?: string[];
}

/** Light parse/match — list draft conflicts before starting the import job. */
export async function preflightServiceRulesFromPostman(payload: {
  collection: unknown;
  environment?: unknown | null;
  instCd?: string | null;
}): Promise<PostmanRulesImportPreflightDto> {
  return apiRequest<PostmanRulesImportPreflightDto>(
    "/api/v1/service-rules/import-from-postman/preflight",
    {
      method: "POST",
      body: JSON.stringify({
        inst_cd: getRequiredInstCd(payload.instCd),
        collection: payload.collection,
        environment: payload.environment ?? null,
      }),
    },
  );
}

/** Upsert YAML drafts from Postman Collection or single Request JSON. */
export async function importServiceRulesFromPostman(payload: {
  collection: unknown;
  environment?: unknown | null;
  overwrite_draft?: boolean;
  created_by?: string | null;
  instCd?: string | null;
}): Promise<PostmanRulesImportResultDto> {
  return apiRequest<PostmanRulesImportResultDto>(
    "/api/v1/service-rules/import-from-postman",
    {
      method: "POST",
      body: JSON.stringify({
        inst_cd: getRequiredInstCd(payload.instCd),
        collection: payload.collection,
        environment: payload.environment ?? null,
        overwrite_draft: payload.overwrite_draft ?? false,
        created_by: payload.created_by ?? null,
      }),
    },
  );
}

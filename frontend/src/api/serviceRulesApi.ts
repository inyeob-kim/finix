import { apiRequest } from "./client";
import type { ServiceRuleBundleReadDto } from "./types";

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

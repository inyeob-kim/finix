import { apiRequest } from "./client";

export type ServiceRulePreviewDto = {
  service_code: string;
  service_name: string | null;
  source_version: string | null;
  exists: boolean;
  filename: string;
  rule_count: number;
  rule_ids: string[];
  raw: Record<string, unknown>;
};

export async function previewRulesYaml(
  serviceCode: string,
): Promise<ServiceRulePreviewDto> {
  return apiRequest<ServiceRulePreviewDto>(`/api/v1/rules-yaml/${serviceCode}`, {
    method: "GET",
  });
}


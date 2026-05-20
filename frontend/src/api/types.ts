/** API JSON shapes aligned with backend ``/api/v1`` responses (minimal fields used by UI). */

export interface ScenarioStepDto {
  id: string;
  number: number;
  action: string;
  result: "success" | "error";
  reason?: string | null;
}

export interface ScenarioReadDto {
  id: number;
  title: string;
  description: string | null;
  content: string | null;
  prompt: string | null;
  steps: ScenarioStepDto[];
  is_saved: boolean;
  created_at: string;
}

export interface ServiceCatalogItemReadDto {
  service_code: string;
  service_name: string;
  http_method: string;
  uri: string;
  source: string;
  source_version: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ServiceCatalogImportResultDto {
  source: string;
  source_version: string | null;
  upserted: number;
}

/** Active or draft service rule bundle (v1). */
export interface ServiceRuleBundleReadDto {
  id: number;
  service_code: string;
  service_name_snapshot: string | null;
  status: string;
  is_active?: boolean;
  version: number;
  source_version: string | null;
  checksum: string;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  yaml_text?: string | null;
  rules?: Record<string, unknown> | null;
}

export interface TestCaseReadDto {
  id: number;
  scenario_id: number | null;
  name: string;
  method: string | null;
  endpoint: string | null;
  request_body: Record<string, unknown>;
  expected_status: number | null;
  expected_body: Record<string, unknown>;
  step_index: number | null;
  created_at: string;
}

export interface ExecutionStepDto {
  step_index: number;
  step_label: string;
  testcase_id: number | null;
  status: "passed" | "failed";
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  error_message: string | null;
}

export interface ExecutionDetailDto {
  id: number;
  scenario_id: number | null;
  base_url: string;
  status: string;
  summary: Record<string, unknown>;
  created_at: string;
  steps: ExecutionStepDto[];
}

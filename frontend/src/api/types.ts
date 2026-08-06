/** API JSON shapes aligned with backend ``/api/v1`` responses (minimal fields used by UI). */

export interface ScenarioBindingExtractDto {
  var: string;
  json_path: string;
}

export interface ScenarioBindingInjectDto {
  var: string;
  json_path: string;
}

export interface ScenarioBindingOverrideDto {
  json_path: string;
  value: unknown;
}

export interface ScenarioStepDto {
  id: string;
  number: number;
  action: string;
  result: "success" | "error";
  reason?: string | null;
  service_code?: string | null;
  /** Natural-key link to fnx_testcase (paired with service_code + inst_cd). */
  rule_case_id?: string | null;
  extracts?: ScenarioBindingExtractDto[];
  injects?: ScenarioBindingInjectDto[];
  overrides?: ScenarioBindingOverrideDto[];
}

/** Natural-key reference to a pool test case (svc_code + rule_case_id). */
export interface TestCaseRefDto {
  svc_code: string;
  rule_case_id: string;
}

export interface PostmanCollectionConfigDto {
  base_url?: string;
  header_vars?: Array<{
    key: string;
    value?: string;
    description?: string | null;
    generator?: string | null;
  }>;
  start_vars?: Array<{
    key: string;
    value?: string;
    description?: string | null;
    generator?: string | null;
  }>;
  default_headers?: Array<{
    key: string;
    value?: string;
  }>;
}

export interface ScenarioReadDto {
  id: number;
  title: string;
  description: string | null;
  content: string | null;
  prompt: string | null;
  steps: ScenarioStepDto[];
  postman?: PostmanCollectionConfigDto | null;
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

export interface ServiceCatalogDtoSkeletonsDto {
  service_code: string;
  found: boolean;
  input_dto_name: string | null;
  output_dto_name: string | null;
  input_skeleton: Record<string, unknown>;
  output_skeleton: Record<string, unknown>;
  input_field_count: number;
  output_field_count: number;
}

export interface ServiceCatalogImportResultDto {
  source: string;
  source_version: string | null;
  upserted: number;
}

/** Applied or working draft service rules document (v1). */
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
  has_draft?: boolean;
  change_kind?: string | null;
}

/** Case-first editor payload from fnx_rule_case (yaml_text assembled server-side). */
export interface ServiceRuleEditorCasesDto {
  service_code: string;
  service_name: string | null;
  source_version: string | null;
  status: string;
  has_draft: boolean;
  is_active: boolean;
  bundle_id: number;
  checksum: string;
  updated_at: string | null;
  updated_by: string | null;
  rules: Record<string, unknown>[];
  yaml_text: string;
}

export interface ResolvedTestCaseStepDto {
  inst_cd: string;
  svc_code: string;
  rule_case_id: string;
  step_index: number;
  name: string;
  method: string | null;
  endpoint: string | null;
  template_request_body: Record<string, unknown>;
  resolved_request_body: Record<string, unknown>;
  inject_warnings: string[];
  expected_status: number | null;
  expected_response_body: Record<string, unknown>;
  simulated_response_body: Record<string, unknown> | null;
}

export interface ScenarioResolvePreviewDto {
  steps: ResolvedTestCaseStepDto[];
  context_after: Record<string, unknown>;
  global_warnings: string[];
}

export interface SuggestedBindingLinkDto {
  from_service_index: number;
  to_service_index: number;
  from_service_code: string;
  to_service_code: string;
  response_path: string;
  request_path: string;
  var: string;
  confidence: "high" | "medium" | "low";
  reason?: string | null;
}

export interface StepBindingsBlockDto {
  service_code: string;
  extracts: ScenarioBindingExtractDto[];
  injects: ScenarioBindingInjectDto[];
}

export interface ScenarioBindingsSuggestDto {
  source: "llm" | "heuristic" | "hybrid";
  summary: string;
  links: SuggestedBindingLinkDto[];
  bindings_by_service: Record<string, StepBindingsBlockDto>;
  link_count: number;
}

export interface TestCaseReadDto {
  inst_cd: string;
  svc_code: string;
  rule_case_id: string;
  name: string;
  case_id?: string | null;
  method: string | null;
  endpoint: string | null;
  request_body: Record<string, unknown>;
  expected_status: number | null;
  expected_body: Record<string, unknown>;
  created_at: string;
}

export interface ExecutionStepDto {
  step_index: number;
  step_label: string;
  inst_cd?: string | null;
  svc_code?: string | null;
  rule_case_id?: string | null;
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

export interface ExecutionListItemDto {
  id: number;
  scenario_id: number | null;
  base_url: string;
  status: string;
  summary: Record<string, unknown>;
  created_at: string;
}

export interface ExecutionListResponseDto {
  items: ExecutionListItemDto[];
  total: number;
  limit: number;
  offset: number;
}

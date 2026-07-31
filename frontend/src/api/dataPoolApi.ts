/** Data pool, log ingest, and OpenAPI API clients. */

import { apiRequest } from "./client";

export type PathKind = "happy" | "negative";
export type LogSource = "paste" | "file_upload" | "server_bulk" | "runner_feedback";

export type ParsedExchangeDto = {
  method: string;
  endpoint: string;
  http_status: number | null;
  service_code: string | null;
  cbb_header: Record<string, unknown>;
  request_body: unknown;
  response_body: unknown;
  biz_error_code: string | null;
  path_kind: PathKind;
  parse_warnings: string[];
};

export type LogParseResponseDto = {
  exchanges: ParsedExchangeDto[];
  count: number;
  happy_count: number;
  negative_count: number;
};

export type LogCommitResultDto = {
  created: number;
  updated: number;
  total: number;
  sample_ids: number[];
};

export type BulkIngestResponseDto = {
  status: "ok" | "not_configured" | "empty";
  message: string;
  commit: LogCommitResultDto | null;
};

export type PoolSampleDto = {
  id: number;
  api_operation_id: number | null;
  service_code: string | null;
  method: string;
  endpoint: string;
  path_kind: PathKind;
  http_status: number | null;
  biz_error_code: string | null;
  cbb_header: Record<string, unknown> | null;
  request_body: unknown;
  response_body: unknown;
  source: string;
  source_fingerprint: string;
  quality_score: number;
  created_at: string | null;
  last_seen_at: string | null;
};

export type PoolSampleListDto = {
  items: PoolSampleDto[];
  total: number;
  happy_total: number;
  negative_total: number;
};

export type OpenApiImportResultDto = {
  document_id: number;
  name: string;
  version: string | null;
  operations_upserted: number;
  checksum: string;
  reused_document: boolean;
};

export type ApiOperationDto = {
  id: number;
  openapi_document_id: number | null;
  service_code: string | null;
  method: string;
  path: string;
  operation_id: string | null;
  summary: string | null;
  created_at: string | null;
};

export type OpenApiDocumentDto = {
  id: number;
  name: string;
  version: string | null;
  checksum: string;
  imported_at: string | null;
  operation_count: number;
};

export async function parseLogText(text: string): Promise<LogParseResponseDto> {
  return apiRequest<LogParseResponseDto>("/api/v1/log-ingest/parse", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function commitLogExchanges(payload: {
  text?: string;
  exchanges?: ParsedExchangeDto[];
  source?: LogSource;
}): Promise<LogCommitResultDto> {
  return apiRequest<LogCommitResultDto>("/api/v1/log-ingest/commit", {
    method: "POST",
    body: JSON.stringify({
      text: payload.text ?? null,
      exchanges: payload.exchanges ?? null,
      source: payload.source ?? "paste",
    }),
  });
}

export async function bulkIngestLogs(payload: {
  service_code?: string;
  log_text?: string;
  created_from?: string;
  created_to?: string;
}): Promise<BulkIngestResponseDto> {
  return apiRequest<BulkIngestResponseDto>("/api/v1/log-ingest/bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listPoolSamples(params?: {
  service_code?: string;
  path_kind?: PathKind | "";
  source?: string;
  biz_error_code?: string;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<PoolSampleListDto> {
  const q = new URLSearchParams();
  if (params?.service_code) q.set("service_code", params.service_code);
  if (params?.path_kind) q.set("path_kind", params.path_kind);
  if (params?.source) q.set("source", params.source);
  if (params?.biz_error_code) q.set("biz_error_code", params.biz_error_code);
  if (params?.query) q.set("query", params.query);
  q.set("limit", String(params?.limit ?? 50));
  q.set("offset", String(params?.offset ?? 0));
  return apiRequest<PoolSampleListDto>(`/api/v1/data-pool/samples?${q.toString()}`);
}

export async function getPoolSample(sampleId: number): Promise<PoolSampleDto> {
  return apiRequest<PoolSampleDto>(`/api/v1/data-pool/samples/${sampleId}`);
}

export async function importOpenApiDocument(payload: {
  document: unknown;
  name?: string;
}): Promise<OpenApiImportResultDto> {
  const q = payload.name
    ? `?name=${encodeURIComponent(payload.name)}`
    : "";
  return apiRequest<OpenApiImportResultDto>(`/api/v1/openapi/import${q}`, {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      document: payload.document,
    }),
  });
}

export async function listOpenApiDocuments(): Promise<OpenApiDocumentDto[]> {
  return apiRequest<OpenApiDocumentDto[]>("/api/v1/openapi/documents");
}

export async function listApiOperations(params?: {
  query?: string;
  service_code?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiOperationDto[]> {
  const q = new URLSearchParams();
  if (params?.query) q.set("query", params.query);
  if (params?.service_code) q.set("service_code", params.service_code);
  q.set("limit", String(params?.limit ?? 100));
  q.set("offset", String(params?.offset ?? 0));
  return apiRequest<ApiOperationDto[]>(`/api/v1/openapi/operations?${q.toString()}`);
}

export type BulkStatusDto = {
  configured: boolean;
  directory: string | null;
  url: string | null;
  file_count: number;
  message: string;
};

export async function getBulkStatus(): Promise<BulkStatusDto> {
  return apiRequest<BulkStatusDto>("/api/v1/log-ingest/bulk-status");
}

export type PoolServiceCoverageDto = {
  service_code: string;
  total: number;
  happy: number;
  negative: number;
};

export type PoolCoverageDto = {
  items: PoolServiceCoverageDto[];
  service_count: number;
};

export async function getPoolCoverage(limit = 50): Promise<PoolCoverageDto> {
  return apiRequest<PoolCoverageDto>(
    `/api/v1/data-pool/coverage?limit=${encodeURIComponent(String(limit))}`,
  );
}

export type DashboardOverviewDto = {
  pool: {
    total: number;
    happy: number;
    negative: number;
    by_source: Record<string, number>;
    by_service?: Array<{
      service_code: string;
      total: number;
      happy: number;
      negative: number;
    }>;
  };
  executions: {
    runs_total: number;
    runs_completed: number;
    steps_passed: number;
    steps_failed: number;
    assertion_passed: number;
    assertion_failed: number;
    expected_error_passed: number;
    expected_error_failed: number;
    happy_replay_passed: number;
    happy_replay_failed: number;
  };
};

export async function getDashboardOverview(params?: {
  created_from?: string;
  created_to?: string;
}): Promise<DashboardOverviewDto> {
  const q = new URLSearchParams();
  if (params?.created_from) q.set("created_from", params.created_from);
  if (params?.created_to) q.set("created_to", params.created_to);
  const qs = q.toString();
  return apiRequest<DashboardOverviewDto>(
    `/api/v1/dashboard/overview${qs ? `?${qs}` : ""}`,
  );
}

export type PromoteResultDto = {
  testcase_id: number;
  pool_sample_id: number | null;
  name: string;
  reused: boolean;
};

export type PromoteBatchResultDto = {
  items: PromoteResultDto[];
  count: number;
};

export async function promotePoolSample(
  sampleId: number,
  replaceExisting = false,
): Promise<PromoteResultDto> {
  return apiRequest<PromoteResultDto>(
    `/api/v1/data-pool/samples/${sampleId}/promote`,
    {
      method: "POST",
      body: JSON.stringify({ replace_existing: replaceExisting }),
    },
  );
}

export async function promotePoolByService(payload: {
  service_code: string;
  path_kind?: PathKind;
  replace_existing?: boolean;
}): Promise<PromoteBatchResultDto> {
  return apiRequest<PromoteBatchResultDto>("/api/v1/data-pool/promote-by-service", {
    method: "POST",
    body: JSON.stringify({
      service_code: payload.service_code,
      path_kind: payload.path_kind ?? null,
      replace_existing: payload.replace_existing ?? false,
    }),
  });
}

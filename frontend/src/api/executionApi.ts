import { apiRequest } from "./client";
import type {
  ExecutionDetailDto,
  ExecutionListResponseDto,
} from "./types";

export async function runScenarioExecution(body: {
  scenario_id: number;
  base_url?: string;
  mode?: "simulate" | "live";
}): Promise<ExecutionDetailDto> {
  return apiRequest<ExecutionDetailDto>("/api/v1/executions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getExecution(
  executionId: number,
): Promise<ExecutionDetailDto> {
  return apiRequest<ExecutionDetailDto>(`/api/v1/executions/${executionId}`, {
    method: "GET",
  });
}

export async function listExecutions(params?: {
  limit?: number;
  offset?: number;
  created_from?: string;
  created_to?: string;
  scenario_id?: number;
}): Promise<ExecutionListResponseDto> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  if (params?.created_from) qs.set("created_from", params.created_from);
  if (params?.created_to) qs.set("created_to", params.created_to);
  if (params?.scenario_id != null) {
    qs.set("scenario_id", String(params.scenario_id));
  }
  const query = qs.toString();
  return apiRequest<ExecutionListResponseDto>(
    `/api/v1/executions${query ? `?${query}` : ""}`,
    { method: "GET" },
  );
}

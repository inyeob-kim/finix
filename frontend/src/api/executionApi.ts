import { apiRequest } from "./client";
import type { ExecutionDetailDto } from "./types";

export async function runScenarioExecution(body: {
  scenario_id: number;
  base_url?: string;
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

import type { ExecutionDetailDto } from "@/api/types";
import { executionModeFromSummary } from "@/lib/executionStepView";

export type ExecutionRerunPayload = {
  scenario_id: number;
  base_url: string;
  mode: "simulate" | "live";
};

export function buildExecutionRerunPayload(
  detail: ExecutionDetailDto,
): ExecutionRerunPayload | null {
  if (detail.scenario_id == null) return null;
  const mode = executionModeFromSummary(detail.summary) ?? "live";
  return {
    scenario_id: detail.scenario_id,
    base_url: detail.base_url?.trim() ?? "",
    mode,
  };
}

export function validateExecutionRerunPayload(
  payload: ExecutionRerunPayload,
): string | null {
  if (payload.mode === "live" && !payload.base_url) {
    return "Live 재실행에는 Base URL이 필요합니다.";
  }
  return null;
}

import type { ExecutionDetailDto } from "@/api/types";

export type ExecutionRerunPayload = {
  scenario_id: number;
  base_url: string;
  mode: "simulate" | "live";
};

export function buildExecutionRerunPayload(
  detail: ExecutionDetailDto,
): ExecutionRerunPayload | null {
  if (detail.scenario_id == null) return null;
  return {
    scenario_id: detail.scenario_id,
    base_url: detail.base_url?.trim() ?? "",
    mode: "live",
  };
}

export function validateExecutionRerunPayload(
  payload: ExecutionRerunPayload,
): string | null {
  if (!payload.base_url) {
    return "재실행에는 Base URL이 필요합니다.";
  }
  return null;
}

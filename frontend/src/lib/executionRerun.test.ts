import { describe, expect, it } from "vitest";
import type { ExecutionDetailDto } from "@/api/types";
import {
  buildExecutionRerunPayload,
  validateExecutionRerunPayload,
} from "./executionRerun";

function detail(
  partial: Partial<ExecutionDetailDto> & Pick<ExecutionDetailDto, "id">,
): ExecutionDetailDto {
  return {
    scenario_id: 1,
    base_url: "https://api.test",
    status: "completed",
    summary: { mode: "live", passed: 1, failed: 0 },
    created_at: new Date().toISOString(),
    steps: [],
    ...partial,
  };
}

describe("executionRerun", () => {
  it("builds payload from execution detail", () => {
    const payload = buildExecutionRerunPayload(detail({ id: 10 }));
    expect(payload).toEqual({
      scenario_id: 1,
      base_url: "https://api.test",
      mode: "live",
    });
  });

  it("returns null without scenario_id", () => {
    expect(
      buildExecutionRerunPayload(detail({ id: 10, scenario_id: null })),
    ).toBeNull();
  });

  it("validates live base url", () => {
    const payload = buildExecutionRerunPayload(
      detail({ id: 10, base_url: "", summary: { mode: "live" } }),
    );
    expect(payload).not.toBeNull();
    expect(validateExecutionRerunPayload(payload!)).toMatch(/Base URL/);
  });
});

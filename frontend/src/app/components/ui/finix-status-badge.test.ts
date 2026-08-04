import { describe, expect, it } from "vitest";
import {
  executionStatusBadge,
  rulesRegistryStatusBadge,
} from "@/app/components/ui/finix-status-badge";

describe("rulesRegistryStatusBadge", () => {
  it("maps active to 적용됨", () => {
    expect(rulesRegistryStatusBadge("active")).toEqual({
      tone: "success",
      label: "적용됨",
    });
  });

  it("maps history inactive active to 이력", () => {
    expect(rulesRegistryStatusBadge("active", { isActive: false })).toEqual({
      tone: "neutral",
      label: "이력",
    });
  });

  it("maps draft to 작업 중", () => {
    expect(rulesRegistryStatusBadge("draft")).toEqual({
      tone: "warning",
      label: "작업 중",
    });
  });
});

describe("executionStatusBadge", () => {
  it("maps running/success/failed", () => {
    expect(executionStatusBadge("running").label).toBe("진행");
    expect(executionStatusBadge("success").tone).toBe("success");
    expect(executionStatusBadge("failed").tone).toBe("danger");
  });
});

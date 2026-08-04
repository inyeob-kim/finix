import { describe, expect, it } from "vitest";
import {
  executionStatusBadge,
  rulesRegistryStatusBadge,
} from "@/app/components/ui/finix-status-badge";

describe("rulesRegistryStatusBadge", () => {
  it("maps active to 운영", () => {
    expect(rulesRegistryStatusBadge("active")).toEqual({
      tone: "success",
      label: "운영",
    });
  });

  it("maps history inactive active to 운영 (구버전)", () => {
    expect(rulesRegistryStatusBadge("active", { isActive: false })).toEqual({
      tone: "neutral",
      label: "운영 (구버전)",
    });
  });

  it("maps draft to 초안", () => {
    expect(rulesRegistryStatusBadge("draft")).toEqual({
      tone: "warning",
      label: "초안",
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

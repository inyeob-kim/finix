import { describe, expect, it } from "vitest";
import {
  compareTestCasesByCaseId,
  inferPathKindFromTestCase,
  parseMaterializedTestCaseName,
  testCaseMatchesQuery,
} from "./materializedTestCaseMeta";
import type { TestCaseReadDto } from "@/api/types";

function sample(partial: Partial<TestCaseReadDto>): TestCaseReadDto {
  return {
    inst_cd: "FNX",
    svc_code: "PY027",
    rule_case_id: "PY027-E-001",
    name: "[E] PY027-E-001 · AAPCME0006 · pymntDt 누락",
    case_id: "PY027-E-001",
    method: "POST",
    endpoint: "/api/x",
    request_body: {},
    expected_status: 400,
    expected_body: {},
    created_at: "2026-07-13T00:00:00Z",
    ...partial,
  };
}

describe("parseMaterializedTestCaseName", () => {
  it("parses type, case_id, and label", () => {
    expect(
      parseMaterializedTestCaseName(
        "[E] PY027-E-001 · AAPCME0006 · pymntDt 누락",
      ),
    ).toEqual({
      pathKind: "E",
      caseId: "PY027-E-001",
      shortLabel: "AAPCME0006 · pymntDt 누락",
    });
  });

  it("returns raw name when prefix missing", () => {
    expect(parseMaterializedTestCaseName("plain")).toEqual({
      pathKind: null,
      caseId: null,
      shortLabel: "plain",
    });
  });
});

describe("inferPathKindFromTestCase", () => {
  it("prefers name prefix over status", () => {
    expect(
      inferPathKindFromTestCase(
        sample({ name: "[N] X-N-001 · ok", expected_status: 500 }),
      ),
    ).toBe("N");
  });

  it("falls back to expected_status", () => {
    expect(
      inferPathKindFromTestCase(sample({ name: "legacy", expected_status: 200 })),
    ).toBe("N");
    expect(
      inferPathKindFromTestCase(sample({ name: "legacy", expected_status: 422 })),
    ).toBe("E");
  });
});

describe("testCaseMatchesQuery", () => {
  it("matches case_id and endpoint", () => {
    const row = sample({});
    expect(testCaseMatchesQuery(row, "PY027-E-001")).toBe(true);
    expect(testCaseMatchesQuery(row, "/api/x")).toBe(true);
    expect(testCaseMatchesQuery(row, "missing")).toBe(false);
  });
});

describe("compareTestCasesByCaseId", () => {
  it("orders Normal before Error, then case_id ascending", () => {
    const rows = [
      sample({ rule_case_id: "PY027-E-002", name: "[E] PY027-E-002 · b" }),
      sample({ rule_case_id: "PY027-N-002", name: "[N] PY027-N-002 · n2" }),
      sample({ rule_case_id: "PY027-E-001", name: "[E] PY027-E-001 · a" }),
      sample({ rule_case_id: "PY027-N-001", name: "[N] PY027-N-001 · n1" }),
    ];
    const ordered = [...rows].sort(compareTestCasesByCaseId).map((r) => r.name);
    expect(ordered).toEqual([
      "[N] PY027-N-001 · n1",
      "[N] PY027-N-002 · n2",
      "[E] PY027-E-001 · a",
      "[E] PY027-E-002 · b",
    ]);
  });
});

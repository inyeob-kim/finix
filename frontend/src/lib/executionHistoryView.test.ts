import { describe, expect, it } from "vitest";
import {
  deriveExecutionHistoryStatus,
  filterHistoryRows,
  formatExecutionSummary,
  historyQueryRange,
  mapExecutionListItem,
} from "./executionHistoryView";

describe("executionHistoryView", () => {
  const baseItem = {
    id: 5,
    scenario_id: 2,
    base_url: "https://api.test",
    status: "completed",
    summary: { passed: 2, failed: 1, mode: "live" },
    created_at: "2026-06-02T10:00:00Z",
  };

  it("maps list item with scenario title", () => {
    const row = mapExecutionListItem(baseItem, "출금 시나리오");
    expect(row.scenarioTitle).toBe("출금 시나리오");
    expect(row.status).toBe("failed");
    expect(row.modeLabel).toBe("실행 API");
    expect(row.summary).toContain("실패");
  });

  it("deriveExecutionHistoryStatus handles running", () => {
    expect(
      deriveExecutionHistoryStatus({ ...baseItem, status: "running" }),
    ).toBe("running");
  });

  it("formatExecutionSummary for all passed", () => {
    expect(
      formatExecutionSummary({
        ...baseItem,
        summary: { passed: 3, failed: 0 },
      }),
    ).toBe("3단계 모두 성공");
  });

  it("filterHistoryRows matches id and title", () => {
    const rows = [
      mapExecutionListItem(baseItem, "출금"),
      mapExecutionListItem({ ...baseItem, id: 6, summary: { passed: 1, failed: 0 } }, "입금"),
    ];
    expect(filterHistoryRows(rows, "출금")).toHaveLength(1);
    expect(filterHistoryRows(rows, "5")).toHaveLength(1);
    expect(filterHistoryRows(rows, "", true)).toHaveLength(1);
  });

  it("historyQueryRange all omits bounds", () => {
    expect(
      historyQueryRange({
        preset: "all",
        dateFrom: "2026-01-01",
        timeStart: "00:00",
        timeEnd: "23:59",
      }),
    ).toEqual({});
  });
});

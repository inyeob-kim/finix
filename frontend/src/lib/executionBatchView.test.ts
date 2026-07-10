import { describe, expect, it } from "vitest";
import {
  batchItemsFromMeta,
  buildExecutionBatchPath,
  firstFailedExecutionId,
  parseExecutionIdsFromSearch,
  summarizeBatch,
} from "./executionBatchView";

describe("executionBatchView", () => {
  it("parses ids from query string", () => {
    expect(parseExecutionIdsFromSearch("?ids=3,1,3,abc")).toEqual([3, 1]);
  });

  it("builds batch path", () => {
    expect(buildExecutionBatchPath([10, 20])).toBe("/execution-batch?ids=10,20");
  });

  it("summarizes batch items", () => {
    const items = batchItemsFromMeta({
      runs: [
        {
          itemId: "a",
          title: "A",
          scenarioId: 1,
          executionId: 1,
          passed: 2,
          failed: 0,
        },
        {
          itemId: "b",
          title: "B",
          scenarioId: 2,
          executionId: 2,
          passed: 1,
          failed: 1,
        },
      ],
      skipped: 0,
      errors: [],
    });
    const summary = summarizeBatch(items);
    expect(summary.scenarioCount).toBe(2);
    expect(summary.failedScenarios).toBe(1);
    expect(firstFailedExecutionId(items)).toBe(2);
  });
});

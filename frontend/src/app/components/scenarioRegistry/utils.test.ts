import { describe, expect, it } from "vitest";
import {
  calcCoverage,
  calcEdgeCases,
  hash01,
  normalizeTags,
  safeJsonParse,
} from "./utils";

describe("scenarioRegistry/utils", () => {
  it("safeJsonParse returns null for invalid JSON", () => {
    expect(safeJsonParse("{")).toBeNull();
  });

  it("safeJsonParse parses valid JSON", () => {
    expect(safeJsonParse<{ a: number }>("{\"a\":1}")?.a).toBe(1);
  });

  it("normalizeTags trims/splits/limits", () => {
    expect(normalizeTags(" a, b, , c , d, e, f, g, h, i, j, k ")).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
    ]);
  });

  it("hash01 is deterministic and 0..1", () => {
    const a = hash01("hello");
    const b = hash01("hello");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });

  it("coverage/edge cases behave as expected", () => {
    expect(calcCoverage(0)).toBe(60);
    expect(calcCoverage(1)).toBe(68);
    expect(calcEdgeCases(0)).toBe(0);
    expect(calcEdgeCases(1)).toBe(0);
    expect(calcEdgeCases(5)).toBe(4);
  });
});


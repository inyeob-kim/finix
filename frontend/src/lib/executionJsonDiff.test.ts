import { describe, expect, it } from "vitest";
import {
  diffJsonPaths,
  pathIsHighlighted,
  pickJsonAtPaths,
} from "./executionJsonDiff";

describe("executionJsonDiff", () => {
  it("diffJsonPaths finds nested differences", () => {
    expect(
      diffJsonPaths({ ok: true, data: { id: 1 } }, { ok: true, data: { id: 2 } }),
    ).toEqual(["data.id"]);
  });

  it("pickJsonAtPaths keeps nested structure", () => {
    const src = { a: { b: 1, c: 2 }, d: 3 };
    expect(pickJsonAtPaths(src, ["a.b", "d"])).toEqual({ a: { b: 1 }, d: 3 });
  });

  it("pathIsHighlighted matches prefix paths", () => {
    expect(pathIsHighlighted("data", ["data.id"])).toBe(true);
    expect(pathIsHighlighted("other", ["data.id"])).toBe(false);
  });
});

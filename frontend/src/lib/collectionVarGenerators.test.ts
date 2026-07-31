import { describe, expect, it } from "vitest";
import {
  resolveCollectionVarGenerator,
  resolveCollectionVarValue,
  collectionVarSourceLabel,
} from "./collectionVarGenerators";

describe("collectionVarGenerators", () => {
  it("resolves today as YYYYMMDD", () => {
    const v = resolveCollectionVarGenerator("today_yyyymmdd");
    expect(v).toMatch(/^\d{8}$/);
  });

  it("prefers generator over literal value", () => {
    const v = resolveCollectionVarValue({
      value: "ignored",
      generator: "uuid",
    });
    expect(v).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("labels sources for UI", () => {
    expect(collectionVarSourceLabel({ value: "X", generator: null })).toBe(
      "고정 · X",
    );
    expect(
      collectionVarSourceLabel({ value: "", generator: "korean_rrn" }),
    ).toContain("동적");
  });
});

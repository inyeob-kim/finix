import { describe, expect, it } from "vitest";
import {
  findJsonStringBounds,
  insertOrReplaceJsonStringValue,
} from "./jsonStringReplace";

describe("jsonStringReplace", () => {
  const sample = `{
  "custId": "CUST001",
  "amount": 1
}`;

  it("finds string bounds for inner cursor", () => {
    const idx = sample.indexOf("CUST001") + 2;
    expect(findJsonStringBounds(sample, idx)).toEqual({
      start: sample.indexOf('"CUST001"'),
      end: sample.indexOf('"CUST001"') + '"CUST001"'.length,
    });
  });

  it("replaces whole string when cursor is inside value", () => {
    const idx = sample.indexOf("CUST001") + 1;
    const { next } = insertOrReplaceJsonStringValue(
      sample,
      idx,
      idx,
      '"{{custId}}"',
    );
    expect(next).toContain('"custId": "{{custId}}"');
    expect(next).not.toContain("CUST001");
    expect(next).not.toContain('""{{');
  });

  it("replaces when only inner text is selected (double-click)", () => {
    const innerStart = sample.indexOf("CUST001");
    const innerEnd = innerStart + "CUST001".length;
    const { next } = insertOrReplaceJsonStringValue(
      sample,
      innerStart,
      innerEnd,
      '"{{custId}}"',
    );
    expect(next).toContain('"custId": "{{custId}}"');
    expect(next).not.toContain('""{{custId}}""');
  });
});

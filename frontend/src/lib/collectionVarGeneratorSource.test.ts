import { describe, expect, it } from "vitest";
import {
  parseGeneratorSource,
  renderGeneratorSource,
} from "./collectionVarGeneratorSource";

describe("collectionVarGeneratorSource", () => {
  it("renders and parses date_offset settings", () => {
    const src = renderGeneratorSource({
      impl_kind: "date_offset",
      impl: { unit: "months", n: 3, format: "YYYYMMDD" },
    });
    expect(src).toContain("def generate()");
    expect(src).toContain('UNIT = "months"');
    expect(src).toContain("N = 3");

    const parsed = parseGeneratorSource(src, "date_offset");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.impl_kind).toBe("date_offset");
    expect(parsed.spec.impl).toEqual({
      unit: "months",
      n: 3,
      format: "YYYYMMDD",
    });
  });

  it("parses edited N for date_offset", () => {
    const src = renderGeneratorSource({
      impl_kind: "date_offset",
      impl: { unit: "days", n: 1, format: "YYYYMMDD" },
    }).replace("N = 1", "N = 14");
    const parsed = parseGeneratorSource(src, "date_offset");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.impl.n).toBe(14);
  });

  it("renders and parses pick_from_list values", () => {
    const src = renderGeneratorSource({
      impl_kind: "pick_from_list",
      impl: { values: ["Ada", "Bob", "Chen"] },
    });
    expect(src).toContain("VALUES");
    expect(src).toContain('"Ada"');
    const parsed = parseGeneratorSource(src, "pick_from_list");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.impl_kind).toBe("pick_from_list");
    expect(parsed.spec.impl.values).toEqual(["Ada", "Bob", "Chen"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  looksCompleteJsonText,
  normalizeRequestBodyJsonText,
  tryParseBodyObject,
} from "./parseRequestBodyJson";

describe("tryParseBodyObject", () => {
  it("accepts plain objects", () => {
    const r = tryParseBodyObject('{\n  "a": 1\n}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ a: 1 });
  });

  it("rejects top-level arrays", () => {
    const r = tryParseBodyObject('[{"a":1}]');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("최상위");
  });

  it("accepts bare Postman {{var}} tokens", () => {
    const r = tryParseBodyObject('{"acctNo": {{acctNo}}, "amt": 100}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ acctNo: "{{acctNo}}", amt: 100 });
  });

  it("keeps quoted Postman tokens", () => {
    const r = tryParseBodyObject('{"acctNo": "{{acctNo}}"}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ acctNo: "{{acctNo}}" });
  });

  it("strips trailing commas", () => {
    const r = tryParseBodyObject('{"a":1,"b":[2,],}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ a: 1, b: [2] });
  });

  it("strips BOM", () => {
    const r = tryParseBodyObject('\uFEFF{"a":1}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ a: 1 });
  });

  it("does not rewrite {{var}} inside strings", () => {
    const raw = '{"note": "use {{acctNo}} later"}';
    expect(normalizeRequestBodyJsonText(raw)).toBe(raw);
    const r = tryParseBodyObject(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ note: "use {{acctNo}} later" });
  });
});

describe("looksCompleteJsonText", () => {
  it("detects incomplete objects", () => {
    expect(looksCompleteJsonText('{"a":')).toBe(false);
    expect(looksCompleteJsonText('{"a":1}')).toBe(true);
  });
});

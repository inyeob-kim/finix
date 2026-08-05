import { describe, expect, it } from "vitest";
import {
  findYamlPlainScalarAfterColon,
  findYamlSingleQuotedBounds,
  insertOrReplaceYamlMacroValue,
} from "./yamlMacroInsert";

describe("yamlMacroInsert", () => {
  it("replaces empty single-quoted scalar '' with double-quoted macro", () => {
    const text = "  frstNm: ''\n  lastNm: x";
    const cursor = text.indexOf("''") + 1;
    const { next } = insertOrReplaceYamlMacroValue(
      text,
      cursor,
      cursor,
      "{{$date.today()}}",
    );
    expect(next).toContain('frstNm: "{{$date.today()}}"');
    expect(next).not.toContain("'\"");
    expect(next).not.toContain("\"'");
  });

  it("replaces double-quoted scalar like JSON editor", () => {
    const text = '  frstNm: "OLD"\n';
    const cursor = text.indexOf("OLD") + 1;
    const { next } = insertOrReplaceYamlMacroValue(
      text,
      cursor,
      cursor,
      "{{$generator.name()}}",
    );
    expect(next).toContain('frstNm: "{{$generator.name()}}"');
    expect(next).not.toContain("OLD");
  });

  it("replaces plain unquoted scalar after colon", () => {
    const text = "  frstNm: Alice\n";
    const cursor = text.indexOf("Alice") + 2;
    const { next } = insertOrReplaceYamlMacroValue(
      text,
      cursor,
      cursor,
      "{{$generator.name()}}",
    );
    expect(next).toContain('frstNm: "{{$generator.name()}}"');
    expect(next).not.toContain("Alice");
  });

  it("finds single-quoted empty bounds", () => {
    const text = "frstNm: ''";
    const start = text.indexOf("'");
    expect(findYamlSingleQuotedBounds(text, start + 1)).toEqual({
      start,
      end: start + 2,
    });
  });

  it("finds plain scalar range for empty value after colon", () => {
    const text = "frstNm: ";
    const range = findYamlPlainScalarAfterColon(text, text.length);
    expect(range).toEqual({ start: text.length, end: text.length });
  });
});

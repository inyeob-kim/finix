import { describe, expect, it } from "vitest";
import {
  encodeGeneratorRef,
  generatorRefToPickerMode,
  splitGeneratorRef,
} from "./generatorRef";

describe("generatorRef", () => {
  it("encodes korean name parts", () => {
    expect(encodeGeneratorRef("korean_name", "full")).toBe("korean_name");
    expect(encodeGeneratorRef("korean_name", "family")).toBe(
      "korean_name.family",
    );
    expect(encodeGeneratorRef("literal")).toBeNull();
    expect(encodeGeneratorRef("uuid")).toBe("uuid");
  });

  it("splits stored refs", () => {
    expect(splitGeneratorRef("korean_name.given")).toEqual({
      base: "korean_name",
      namePart: "given",
    });
    expect(splitGeneratorRef("korean_name")).toEqual({
      base: "korean_name",
      namePart: "full",
    });
    expect(generatorRefToPickerMode("korean_name.middle")).toBe("korean_name");
  });
});

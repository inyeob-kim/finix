import { describe, expect, it } from "vitest";
import {
  datePresetToYamlMacro,
  generatorKeyToYamlMacro,
} from "./yamlInputMacros";
import { insertOrReplaceJsonStringValue } from "./jsonStringReplace";

describe("yamlInputMacros", () => {
  it("maps scenario builtins to YAML macros", () => {
    expect(generatorKeyToYamlMacro("today_yyyymmdd")).toBe("{{$date.today()}}");
    expect(generatorKeyToYamlMacro("korean_name")).toBe("{{$generator.name()}}");
    expect(generatorKeyToYamlMacro("korean_rrn")).toBe("{{$generator.ssn()}}");
    expect(generatorKeyToYamlMacro("uuid")).toBe("{{$generator.uuid()}}");
    expect(generatorKeyToYamlMacro("random_digits")).toBe(
      "{{$generator.random_digits()}}",
    );
    expect(generatorKeyToYamlMacro("my_shared")).toBe("{{$generator.my_shared()}}");
  });

  it("builds date macros", () => {
    expect(datePresetToYamlMacro("today")).toBe("{{$date.today()}}");
    expect(datePresetToYamlMacro("addDays", 3)).toBe("{{$date.addDays(3)}}");
  });

  it("replaces JSON string value like scenario var insert", () => {
    const sample = `{
  "pymntDt": "20260101",
  "amount": 1
}`;
    const idx = sample.indexOf("20260101") + 1;
    const { next } = insertOrReplaceJsonStringValue(
      sample,
      idx,
      idx,
      JSON.stringify("{{$date.today()}}"),
    );
    expect(next).toContain('"pymntDt": "{{$date.today()}}"');
    expect(next).not.toContain("20260101");
  });
});

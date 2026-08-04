import { describe, expect, it } from "vitest";
import {
  filterGeneratorPickerOptions,
  labelForGeneratorMode,
  toGeneratorPickerOptions,
} from "./collectionVarGeneratorPicker";

describe("collectionVarGeneratorPicker", () => {
  const catalog = [
    {
      key: "uuid",
      label: "UUID",
      description: "새 UUID",
      hint: "실행마다",
      source: "builtin" as const,
      impl_kind: "uuid",
    },
    {
      key: "eng_name",
      label: "영문 이름",
      description: "랜덤 영문",
      hint: null,
      source: "shared" as const,
      impl_kind: "python",
    },
  ];

  it("maps catalog to picker options", () => {
    expect(toGeneratorPickerOptions(catalog)).toEqual([
      {
        key: "uuid",
        label: "UUID",
        description: "새 UUID",
        hint: "실행마다",
        source: "builtin",
      },
      {
        key: "eng_name",
        label: "영문 이름",
        description: "랜덤 영문",
        hint: null,
        source: "shared",
      },
    ]);
  });

  it("filters by label, key, and source", () => {
    const opts = toGeneratorPickerOptions(catalog);
    expect(filterGeneratorPickerOptions(opts, "uuid")).toHaveLength(1);
    expect(filterGeneratorPickerOptions(opts, "영문")).toHaveLength(1);
    expect(filterGeneratorPickerOptions(opts, "공유")).toHaveLength(1);
    expect(filterGeneratorPickerOptions(opts, "없음")).toHaveLength(0);
  });

  it("labels modes for the trigger", () => {
    const opts = toGeneratorPickerOptions(catalog);
    expect(labelForGeneratorMode("literal", opts)).toBe("고정값");
    expect(labelForGeneratorMode("uuid", opts)).toBe("UUID");
    expect(labelForGeneratorMode("eng_name", opts)).toBe("[공유] 영문 이름");
  });
});

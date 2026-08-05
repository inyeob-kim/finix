/** Map scenario generator keys / date presets to YAML rule input macros. */

import {
  isKoreanNameGeneratorKey,
  splitGeneratorRef,
  type KoreanNameMacroPart,
} from "./generatorRef";

export type YamlMacroKind = "generator" | "date";

export type { KoreanNameMacroPart } from "./generatorRef";
export {
  isKoreanNameGeneratorKey,
  KOREAN_NAME_PART_OPTIONS,
  encodeGeneratorRef,
  splitGeneratorRef,
  generatorRefToPickerMode,
} from "./generatorRef";

/** Scenario builtin generator id → YAML macro token. */
export function generatorKeyToYamlMacro(
  key: string,
  namePart: KoreanNameMacroPart = "full",
): string {
  const k = key.trim();
  switch (k) {
    case "today_yyyymmdd":
      return "{{$date.today()}}";
    case "korean_name":
    case "name":
      return koreanNamePartToYamlMacro(namePart);
    case "korean_rrn":
      return "{{$generator.ssn()}}";
    case "uuid":
      return "{{$generator.uuid()}}";
    case "random_digits":
      return "{{$generator.random_digits()}}";
    default:
      return `{{$generator.${k}()}}`;
  }
}

export function koreanNamePartToYamlMacro(part: KoreanNameMacroPart): string {
  if (part === "full") return "{{$generator.name()}}";
  return `{{$generator.name.${part}()}}`;
}

/** Stored generator ref (e.g. korean_name.family) → YAML macro. */
export function generatorRefToYamlMacro(
  generator: string | null | undefined,
): string | null {
  const { base, namePart } = splitGeneratorRef(generator);
  if (!base) return null;
  if (isKoreanNameGeneratorKey(base)) {
    return koreanNamePartToYamlMacro(namePart);
  }
  return generatorKeyToYamlMacro(base);
}

export function datePresetToYamlMacro(
  preset: "today" | "addDays" | "addMonths" | "addYears",
  arg = 1,
): string {
  if (preset === "today") return "{{$date.today()}}";
  return `{{$date.${preset}(${arg})}}`;
}

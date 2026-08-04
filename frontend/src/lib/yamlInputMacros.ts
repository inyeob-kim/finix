/** Map scenario generator keys / date presets to YAML rule input macros. */

export type YamlMacroKind = "generator" | "date";

/** Scenario builtin generator id → YAML macro token. */
export function generatorKeyToYamlMacro(key: string): string {
  const k = key.trim();
  switch (k) {
    case "today_yyyymmdd":
      return "{{$date.today()}}";
    case "korean_name":
      return "{{$generator.name()}}";
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

export function datePresetToYamlMacro(
  preset: "today" | "addDays" | "addMonths" | "addYears",
  arg = 1,
): string {
  if (preset === "today") return "{{$date.today()}}";
  return `{{$date.${preset}(${arg})}}`;
}

/** Shared generator selection (YAML macros + scenario collection vars). */

export type KoreanNameMacroPart = "full" | "family" | "given" | "middle";

export const KOREAN_NAME_PART_OPTIONS: Array<{
  id: KoreanNameMacroPart;
  label: string;
}> = [
  { id: "full", label: "전체" },
  { id: "family", label: "성" },
  { id: "given", label: "이름" },
  { id: "middle", label: "미들" },
];

export function isKoreanNameGeneratorKey(key: string): boolean {
  const k = key.trim();
  return k === "korean_name" || k === "name";
}

/**
 * Split stored generator ref.
 * ``korean_name.family`` → base korean_name + part family.
 */
export function splitGeneratorRef(raw: string | null | undefined): {
  base: string;
  namePart: KoreanNameMacroPart;
} {
  const g = (raw || "").trim();
  if (!g) return { base: "", namePart: "full" };
  const dot = g.indexOf(".");
  if (dot <= 0) {
    return {
      base: g,
      namePart: isKoreanNameGeneratorKey(g) ? "full" : "full",
    };
  }
  const base = g.slice(0, dot).trim();
  const part = g.slice(dot + 1).trim().toLowerCase();
  if (
    isKoreanNameGeneratorKey(base) &&
    (part === "family" ||
      part === "given" ||
      part === "middle" ||
      part === "full")
  ) {
    return { base: "korean_name", namePart: part };
  }
  return { base: g, namePart: "full" };
}

/** Persist picker mode + name part as a single generator id. */
export function encodeGeneratorRef(
  mode: string,
  namePart: KoreanNameMacroPart = "full",
): string | null {
  const m = mode.trim();
  if (!m || m === "literal") return null;
  if (isKoreanNameGeneratorKey(m)) {
    if (namePart === "full") return "korean_name";
    return `korean_name.${namePart}`;
  }
  return m;
}

/** Picker value (mode) from a stored generator ref. */
export function generatorRefToPickerMode(
  generator: string | null | undefined,
): string {
  const { base } = splitGeneratorRef(generator);
  return base || "literal";
}

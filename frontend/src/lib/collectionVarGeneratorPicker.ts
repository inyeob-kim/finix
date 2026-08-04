/** Filter / rank collection-var generators for the declare picker. */

import type { CollectionVarGeneratorDto } from "@/api/collectionVarGeneratorApi";

export const LITERAL_GENERATOR_MODE = "literal";

export type GeneratorPickerOption = {
  key: string;
  label: string;
  description?: string | null;
  hint?: string | null;
  source: "literal" | "builtin" | "shared";
};

export function toGeneratorPickerOptions(
  catalog: readonly CollectionVarGeneratorDto[],
): GeneratorPickerOption[] {
  return catalog.map((g) => ({
    key: g.key,
    label: g.label,
    description: g.description,
    hint: g.hint,
    source: g.source === "shared" ? "shared" : "builtin",
  }));
}

export function filterGeneratorPickerOptions(
  options: readonly GeneratorPickerOption[],
  query: string,
): GeneratorPickerOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  return options.filter((o) => {
    const sourceKo = o.source === "shared" ? "공유" : "내장";
    const hay = [
      o.key,
      o.label,
      o.description ?? "",
      o.hint ?? "",
      o.source,
      sourceKo,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

const RECENT_STORAGE_KEY = "fcc.collection-var-generator-recent";
const RECENT_MAX = 5;

export function loadRecentGeneratorKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      .map((k) => k.trim())
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function pushRecentGeneratorKey(key: string): string[] {
  const k = key.trim();
  if (!k || k === LITERAL_GENERATOR_MODE) return loadRecentGeneratorKeys();
  const next = [k, ...loadRecentGeneratorKeys().filter((x) => x !== k)].slice(
    0,
    RECENT_MAX,
  );
  if (typeof window !== "undefined") {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function labelForGeneratorMode(
  mode: string,
  options: readonly GeneratorPickerOption[],
): string {
  if (mode === LITERAL_GENERATOR_MODE) return "고정값";
  const hit = options.find((o) => o.key === mode);
  if (!hit) return mode;
  return hit.source === "shared" ? `[공유] ${hit.label}` : hit.label;
}

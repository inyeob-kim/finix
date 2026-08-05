import type { ScenarioRegistryFolder, ScenarioRegistryStateV2 } from "./types";

export function hash01(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function calcCoverage(serviceCount: number) {
  return 60 + Math.min(35, serviceCount * 8);
}

export function calcEdgeCases(serviceCount: number) {
  return Math.min(9, Math.max(0, serviceCount - 1));
}

export function nowStamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `reg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeTags(raw: string) {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export function defaultRegistryV2(updatedBy: string): ScenarioRegistryStateV2 {
  const base = nowStamp();
  const rootFolder: ScenarioRegistryFolder = {
    id: newId(),
    name: "Default",
    parentId: null,
    createdAt: base,
    updatedAt: base,
    updatedBy,
  };
  return {
    version: 2,
    folders: [rootFolder],
    scenarios: [],
  };
}

export function getFolderLabel(
  options: Array<{ id: string; label: string; depth: number }>,
  id: string,
) {
  return options.find((o) => o.id === id)?.label ?? "—";
}


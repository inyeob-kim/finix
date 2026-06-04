import type { ScenarioRegistryItem } from "@/app/components/scenarioRegistry/types";
import {
  ensurePostmanConfig,
  type ScenarioPostmanConfig,
} from "@/lib/scenarioPostmanVariables";

export function sanitizeDownloadFilenameStem(title: string): string {
  const stem = title
    .trim()
    .replace(/[^\w\u3131-\uD79D.-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return stem || "scenario";
}

export function defaultSinglePostmanDownloadName(title: string): string {
  return `postman-${sanitizeDownloadFilenameStem(title)}.json`;
}

export function defaultCollectionPostmanZipName(folderLabel: string): string {
  const stem = sanitizeDownloadFilenameStem(folderLabel.trim() || "collection");
  return `postman-${stem === "scenario" ? "collection" : stem}.zip`;
}

export function resolvePostmanDownloadName(
  userInput: string | undefined,
  defaultName: string,
  ext: ".json" | ".zip",
): string {
  const raw = userInput?.trim();
  if (!raw) return defaultName;
  const withoutExt = raw.replace(new RegExp(`${ext.replace(".", "\\.")}$`, "i"), "").trim();
  const stem = sanitizeDownloadFilenameStem(withoutExt || raw);
  const fallback = ext === ".json" ? "scenario" : "collection";
  return `${stem || fallback}${ext}`;
}

/** Apply export-time baseUrl override; empty override keeps saved config. */
export function mergeExportPostmanConfig(
  config: ScenarioPostmanConfig | undefined,
  baseUrlOverride: string | undefined,
): ScenarioPostmanConfig {
  const base = ensurePostmanConfig(config);
  const trimmed = baseUrlOverride?.trim();
  if (!trimmed) return base;
  return { ...base, baseUrl: trimmed };
}

export function pickInitialExportBaseUrl(items: ScenarioRegistryItem[]): string {
  for (const item of items) {
    const url = ensurePostmanConfig(item.postmanConfig).baseUrl.trim();
    if (url) return url;
  }
  return "";
}

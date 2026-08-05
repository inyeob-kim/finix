/** Shared baseUrl + BXM header defaults for scenario and single-TC live runs. */

import {
  ensurePostmanConfig,
  emptyPostmanConfig,
  normalizePostmanConfig,
  type PostmanStartVar,
  type ScenarioPostmanConfig,
} from "@/lib/scenarioPostmanVariables";

const STORAGE_KEY = "finix.executionPostmanDefaults.v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Strip scenario-only start vars; keep baseUrl / headerVars / defaultHeaders. */
export function toExecutionDefaults(
  config: ScenarioPostmanConfig,
): ScenarioPostmanConfig {
  return ensurePostmanConfig({
    baseUrl: config.baseUrl,
    headerVars: config.headerVars,
    defaultHeaders: config.defaultHeaders,
    startVars: [],
  });
}

export function loadExecutionPostmanDefaults(): ScenarioPostmanConfig {
  if (!isBrowser()) return emptyPostmanConfig();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPostmanConfig();
    const parsed = JSON.parse(raw) as Partial<ScenarioPostmanConfig>;
    return toExecutionDefaults(ensurePostmanConfig(parsed));
  } catch {
    return emptyPostmanConfig();
  }
}

export function saveExecutionPostmanDefaults(
  config: ScenarioPostmanConfig,
): void {
  if (!isBrowser()) return;
  try {
    const next = toExecutionDefaults(config);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private mode failures.
  }
}

function mergeHeaderVarRows(
  defaults: PostmanStartVar[],
  overrides: PostmanStartVar[],
): PostmanStartVar[] {
  const overrideByKey = new Map(
    overrides.map((row) => [row.key.trim(), row] as const),
  );
  const seen = new Set<string>();
  const out: PostmanStartVar[] = [];

  for (const row of defaults) {
    const key = row.key.trim();
    if (!key) continue;
    seen.add(key);
    const over = overrideByKey.get(key);
    if (over && over.value.trim()) {
      out.push({ ...row, ...over, key, id: over.id || row.id });
    } else {
      out.push(row);
    }
  }
  for (const row of overrides) {
    const key = row.key.trim();
    if (!key || seen.has(key)) continue;
    out.push(row);
  }
  return out;
}

/**
 * Scenario (or any) config on top of shared defaults.
 * Non-empty scenario baseUrl / header values win; empty falls back to defaults.
 * Scenario startVars are kept as-is (not taken from shared defaults).
 */
export function mergeWithExecutionDefaults(
  scenarioConfig: ScenarioPostmanConfig | Partial<ScenarioPostmanConfig> | undefined,
): ScenarioPostmanConfig {
  const defaults = loadExecutionPostmanDefaults();
  const scenario = ensurePostmanConfig(scenarioConfig);
  const baseUrl = scenario.baseUrl.trim() || defaults.baseUrl;
  return normalizePostmanConfig({
    baseUrl,
    headerVars: mergeHeaderVarRows(defaults.headerVars, scenario.headerVars),
    startVars: scenario.startVars,
    defaultHeaders:
      (scenario.defaultHeaders?.length ?? 0) > 0
        ? scenario.defaultHeaders
        : defaults.defaultHeaders,
  });
}

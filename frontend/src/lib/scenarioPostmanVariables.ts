import type { StepBindingsByStepKey } from "@/lib/scenarioBindings";
import {
  defaultPostmanHeaderRows,
  ensureDefaultHeaders,
  migrateLegacyPostmanHeaders,
  refreshTxDtHeader,
  type PostmanHeaderRow,
} from "@/lib/scenarioPostmanHeaders";
import {
  runStepCaseIdLabel,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";

export type { PostmanHeaderRow } from "@/lib/scenarioPostmanHeaders";

export type PostmanStartVar = {
  id: string;
  key: string;
  value: string;
  description?: string;
};

export type ScenarioPostmanConfig = {
  baseUrl: string;
  startVars: PostmanStartVar[];
  defaultHeaders: PostmanHeaderRow[];
};

export type ExtractVarPreview = {
  var: string;
  stepIndex: number;
  caseLabel: string;
};

export type PostmanVariablePreviewRow = {
  key: string;
  value: string;
  kind: "base" | "start" | "runtime";
  hint?: string;
};

export function emptyPostmanConfig(): ScenarioPostmanConfig {
  return {
    baseUrl: "",
    startVars: [],
    defaultHeaders: defaultPostmanHeaderRows(),
  };
}

/** Merge persisted config with platform defaults (e.g. legacy rows without headers). */
export function ensurePostmanConfig(
  config: Partial<ScenarioPostmanConfig> | undefined,
): ScenarioPostmanConfig {
  const base = emptyPostmanConfig();
  if (!config) return base;
  return {
    baseUrl: config.baseUrl ?? base.baseUrl,
    startVars: config.startVars ?? base.startVars,
    defaultHeaders: migrateLegacyPostmanHeaders(
      ensureDefaultHeaders(config.defaultHeaders),
    ),
  };
}

/** True when postman block should be written to scenario steps_json envelope. */
export function hasPersistablePostmanConfig(config: ScenarioPostmanConfig): boolean {
  const postman = postmanConfigToApi(config);
  return (
    Boolean(postman.base_url) ||
    postman.start_vars.length > 0 ||
    postman.default_headers.length > 0
  );
}

export function startVarKeysFromConfig(config: ScenarioPostmanConfig): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of config.startVars) {
    const k = row.key.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function startVarContextFromConfig(
  config: ScenarioPostmanConfig,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of config.startVars) {
    const k = row.key.trim();
    if (!k) continue;
    out[k] = row.value;
  }
  return out;
}

export function newStartVar(): PostmanStartVar {
  return { id: crypto.randomUUID(), key: "", value: "" };
}

export function newStartVarFromTemplate(
  key: string,
  value = "",
): PostmanStartVar {
  return { id: crypto.randomUUID(), key: key.trim(), value };
}

/** One-line label for summary chips (e.g. ``custId, token 외 2개``). */
export function collectionVarsSummaryText(
  config: ScenarioPostmanConfig,
  maxNames = 2,
): string {
  const keys = startVarKeysFromConfig(config);
  if (keys.length === 0) return "없음";
  if (keys.length <= maxNames) return keys.join(", ");
  const shown = keys.slice(0, maxNames).join(", ");
  return `${shown} 외 ${keys.length - maxNames}개`;
}

export function appendStartVarIfMissing(
  config: ScenarioPostmanConfig,
  key: string,
  value = "",
): ScenarioPostmanConfig {
  const k = key.trim();
  if (!k) return config;
  const exists = config.startVars.some((r) => r.key.trim() === k);
  if (exists) return config;
  return {
    ...config,
    startVars: [...config.startVars, newStartVarFromTemplate(k, value)],
  };
}

/** Collect unique extract variables from bindings (step order). */
export function collectExtractVarPreviews(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
): ExtractVarPreview[] {
  const out: ExtractVarPreview[] = [];
  const seen = new Set<string>();
  runSteps.forEach((step, stepIndex) => {
    const cfg = bindings[step.stepKey];
    for (const ex of cfg?.extracts ?? []) {
      const v = ex.var.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push({
        var: v,
        stepIndex,
        caseLabel: runStepCaseIdLabel(step),
      });
    }
  });
  return out;
}

export function buildPostmanVariablePreview(
  config: ScenarioPostmanConfig,
  extractVars: ExtractVarPreview[],
): PostmanVariablePreviewRow[] {
  const rows: PostmanVariablePreviewRow[] = [];
  const seen = new Set<string>();

  const add = (row: PostmanVariablePreviewRow) => {
    const k = row.key.trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    rows.push({ ...row, key: k });
  };

  add({
    key: "baseUrl",
    value: config.baseUrl.trim(),
    kind: "base",
    hint: "요청 URL 접두사",
  });

  for (const sv of config.startVars) {
    const key = sv.key.trim();
    if (!key) continue;
    add({
      key,
      value: sv.value,
      kind: "start",
      hint: sv.description?.trim() || "실행 전 값",
    });
  }

  for (const ex of extractVars) {
    add({
      key: ex.var,
      value: "",
      kind: "runtime",
      hint: `[${ex.stepIndex + 1}] ${ex.caseLabel} 응답 후 채움`,
    });
  }

  return rows;
}

export function postmanConfigToApi(config: ScenarioPostmanConfig): {
  base_url: string;
  start_vars: Array<{ key: string; value: string; description?: string }>;
  default_headers: Array<{ key: string; value: string }>;
} {
  return {
    base_url: config.baseUrl.trim(),
    start_vars: config.startVars
      .map((r) => ({
        key: r.key.trim(),
        value: r.value,
        description: r.description?.trim() || undefined,
      }))
      .filter((r) => r.key.length > 0),
    default_headers: refreshTxDtHeader(
      ensureDefaultHeaders(config.defaultHeaders),
    )
      .map((r) => ({
        key: r.key.trim(),
        value: r.value,
      }))
      .filter((r) => r.key.length > 0),
  };
}

export function postmanConfigFromApi(raw: {
  base_url?: string;
  start_vars?: Array<{ key: string; value?: string; description?: string | null }>;
  default_headers?: Array<{ key: string; value?: string }>;
} | null | undefined): ScenarioPostmanConfig {
  if (!raw) return emptyPostmanConfig();
  const headerRows = (raw.default_headers ?? []).map((r) => ({
    id: crypto.randomUUID(),
    key: r.key,
    value: r.value ?? "",
  }));
  return {
    baseUrl: raw.base_url?.trim() ?? "",
    startVars: (raw.start_vars ?? []).map((r) => ({
      id: crypto.randomUUID(),
      key: r.key,
      value: r.value ?? "",
      description: r.description?.trim() || undefined,
    })),
    defaultHeaders: ensureDefaultHeaders(headerRows),
  };
}

export function countPostmanVariables(
  config: ScenarioPostmanConfig,
  extractVars: ExtractVarPreview[],
): number {
  return buildPostmanVariablePreview(config, extractVars).length;
}

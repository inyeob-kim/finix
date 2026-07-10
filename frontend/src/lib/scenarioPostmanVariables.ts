import type { StepBindingsByStepKey } from "@/lib/scenarioBindings";
import {
  defaultPostmanHeaderRows,
  ensureDefaultHeaders,
  fccTxDateToday,
  isPostmanPlaceholderValue,
  migrateLegacyPostmanHeaders,
  newHeaderRow,
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

/** Platform collection variables (UI channel keys + hidden lngCd). */
const BXM_PLATFORM_VAR_DEFAULTS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "instCd", value: "1001" },
  { key: "chnlDscd", value: "01" },
  { key: "deptId", value: "10001" },
  { key: "txDt", value: "" },
  { key: "staffId", value: "1100000013" },
  { key: "aprvlId", value: "" },
  { key: "srvcCd", value: "" },
  { key: "scrnId", value: "" },
  { key: "lngCd", value: "ko" },
];

const LEGACY_STAFF_ID_DEFAULT = "1000013";

/** Channel fields shown in collection settings UI. */
export const BXM_CHANNEL_VAR_KEYS = [
  "instCd",
  "chnlDscd",
  "deptId",
  "txDt",
  "staffId",
  "aprvlId",
  "srvcCd",
  "scrnId",
] as const;

const BXM_VAR_KEY_SET = new Set(
  BXM_PLATFORM_VAR_DEFAULTS.map((row) => row.key),
);

/** Header keys that belong in collection variables, not default_headers. */
export const BXM_RESERVED_HEADER_KEYS = new Set<string>([
  ...BXM_CHANNEL_VAR_KEYS,
  "lngCd",
]);

export function isBxmChannelVarKey(key: string): boolean {
  return (BXM_CHANNEL_VAR_KEYS as readonly string[]).includes(key.trim());
}

export function isBxmPlatformVarKey(key: string): boolean {
  return BXM_VAR_KEY_SET.has(key.trim());
}

export function isBxmReservedHeaderKey(key: string): boolean {
  return BXM_RESERVED_HEADER_KEYS.has(key.trim());
}

export function defaultBxmStartVarRows(): PostmanStartVar[] {
  const today = fccTxDateToday();
  return BXM_PLATFORM_VAR_DEFAULTS.map((row) =>
    newStartVarFromTemplate(
      row.key,
      row.key === "txDt" ? today : row.value,
    ),
  );
}

/** Ensure BXMC channel collection variables exist (user values win). */
export function ensureBxmStartVars(
  startVars: PostmanStartVar[] | undefined,
): PostmanStartVar[] {
  const byKey = new Map<string, PostmanStartVar>();
  for (const row of defaultBxmStartVarRows()) {
    byKey.set(row.key, row);
  }
  const customExtras: PostmanStartVar[] = [];
  for (const row of startVars ?? []) {
    const k = row.key.trim();
    if (!k) continue;
    if (BXM_VAR_KEY_SET.has(k)) {
      byKey.set(k, { ...row, key: k });
    } else {
      customExtras.push({ ...row, key: k });
    }
  }
  const staff = byKey.get("staffId");
  if (staff?.value.trim() === LEGACY_STAFF_ID_DEFAULT) {
    byKey.set("staffId", { ...staff, value: "1100000013" });
  }
  const tx = byKey.get("txDt");
  if (tx && !tx.value.trim()) {
    byKey.set("txDt", { ...tx, value: fccTxDateToday() });
  }
  const bxmOrdered = BXM_PLATFORM_VAR_DEFAULTS.map((row) => byKey.get(row.key)!);
  const seenCustom = new Set<string>();
  const customs: PostmanStartVar[] = [];
  for (const row of customExtras) {
    if (seenCustom.has(row.key)) continue;
    seenCustom.add(row.key);
    customs.push(row);
  }
  return [...bxmOrdered, ...customs];
}

export type PostmanConfigNormalizeResult = {
  config: ScenarioPostmanConfig;
  migratedHeaderCount: number;
};

/** Strip BXM channel keys from headers; migrate literal values into start_vars. */
export function normalizePostmanConfigWithMeta(
  config: ScenarioPostmanConfig,
): PostmanConfigNormalizeResult {
  let startVars = [...config.startVars];
  const headers = config.defaultHeaders ?? [];
  const reservedHeaders = headers.filter((h) =>
    isBxmReservedHeaderKey(h.key.trim()),
  );

  for (const h of reservedHeaders) {
    const k = h.key.trim();
    const v = h.value.trim();
    if (!v || isPostmanPlaceholderValue(v)) continue;
    const idx = startVars.findIndex((r) => r.key.trim() === k);
    if (idx >= 0) {
      startVars = startVars.map((row, i) =>
        i === idx ? { ...row, value: v } : row,
      );
    }
  }

  startVars = ensureBxmStartVars(startVars);

  let cleanHeaders = headers.filter(
    (h) => !isBxmReservedHeaderKey(h.key.trim()),
  );
  cleanHeaders = migrateLegacyPostmanHeaders(
    ensureDefaultHeaders(cleanHeaders),
  );

  const hasContentType = cleanHeaders.some(
    (h) => h.key.trim().toLowerCase() === "content-type",
  );
  if (!hasContentType) {
    cleanHeaders = [
      newHeaderRow("Content-Type", "application/json"),
      ...cleanHeaders,
    ];
  }

  return {
    config: {
      ...config,
      startVars,
      defaultHeaders: cleanHeaders,
    },
    migratedHeaderCount: reservedHeaders.length,
  };
}

export function normalizePostmanConfig(
  config: ScenarioPostmanConfig,
): ScenarioPostmanConfig {
  return normalizePostmanConfigWithMeta(config).config;
}

export function splitStartVarsForUi(config: ScenarioPostmanConfig): {
  channelVars: PostmanStartVar[];
  customVars: PostmanStartVar[];
} {
  const byKey = new Map(
    config.startVars.map((row) => [row.key.trim(), row] as const),
  );
  const channelVars = BXM_CHANNEL_VAR_KEYS.map((key) => {
    const row = byKey.get(key);
    if (row) return row;
    if (key === "txDt") {
      return newStartVarFromTemplate(key, fccTxDateToday());
    }
    const template = BXM_PLATFORM_VAR_DEFAULTS.find((r) => r.key === key);
    return newStartVarFromTemplate(key, template?.value ?? "");
  });
  const customVars = config.startVars.filter(
    (row) => row.key.trim() && !BXM_VAR_KEY_SET.has(row.key.trim()),
  );
  return { channelVars, customVars };
}

export function updateStartVarValue(
  config: ScenarioPostmanConfig,
  varKey: string,
  value: string,
): ScenarioPostmanConfig {
  const k = varKey.trim();
  return {
    ...config,
    startVars: config.startVars.map((row) =>
      row.key.trim() === k ? { ...row, value } : row,
    ),
  };
}

export function replaceCustomStartVars(
  config: ScenarioPostmanConfig,
  customVars: PostmanStartVar[],
): ScenarioPostmanConfig {
  const platformVars = ensureBxmStartVars(
    config.startVars.filter((row) => BXM_VAR_KEY_SET.has(row.key.trim())),
  ).filter((row) => BXM_VAR_KEY_SET.has(row.key.trim()));
  return {
    ...config,
    startVars: [...platformVars, ...customVars],
  };
}

export function emptyPostmanConfig(): ScenarioPostmanConfig {
  return {
    baseUrl: "",
    startVars: defaultBxmStartVarRows(),
    defaultHeaders: [{ id: crypto.randomUUID(), key: "Content-Type", value: "application/json" }],
  };
}

/** Merge persisted config with platform defaults (e.g. legacy rows without headers). */
export function ensurePostmanConfig(
  config: Partial<ScenarioPostmanConfig> | undefined,
): ScenarioPostmanConfig {
  const base = emptyPostmanConfig();
  if (!config) return base;
  return normalizePostmanConfig({
    baseUrl: config.baseUrl ?? base.baseUrl,
    startVars: ensureBxmStartVars(config.startVars ?? base.startVars),
    defaultHeaders: migrateLegacyPostmanHeaders(
      ensureDefaultHeaders(config.defaultHeaders),
    ),
  });
}

/** True when postman block should be written to scenario steps_json envelope. */
export function hasPersistablePostmanConfig(config: ScenarioPostmanConfig): boolean {
  const postman = postmanConfigToApi(config);
  return postman.start_vars.length > 0 || postman.default_headers.length > 0;
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
  if (!k || isBxmPlatformVarKey(k)) return config;
  const exists = config.startVars.some((r) => r.key.trim() === k);
  if (exists) return config;
  return replaceCustomStartVars(config, [
    ...splitStartVarsForUi(config).customVars,
    newStartVarFromTemplate(k, value),
  ]);
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

  const baseUrl = config.baseUrl.trim();
  if (baseUrl) {
    add({
      key: "baseUrl",
      value: baseUrl,
      kind: "base",
      hint: "Postman 다운로드·Live 실행 시 입력",
    });
  }

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
  const normalized = normalizePostmanConfig(config);
  return {
    base_url: normalized.baseUrl.trim(),
    start_vars: normalized.startVars
      .map((r) => ({
        key: r.key.trim(),
        value: r.value,
        description: r.description?.trim() || undefined,
      }))
      .filter((r) => r.key.length > 0),
    default_headers: refreshTxDtHeader(normalized.defaultHeaders)
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
  return normalizePostmanConfig({
    baseUrl: raw.base_url?.trim() ?? "",
    startVars: ensureBxmStartVars(
      (raw.start_vars ?? []).map((r) => ({
        id: crypto.randomUUID(),
        key: r.key,
        value: r.value ?? "",
        description: r.description?.trim() || undefined,
      })),
    ),
    defaultHeaders: ensureDefaultHeaders(headerRows),
  });
}

export function countPostmanVariables(
  config: ScenarioPostmanConfig,
  extractVars: ExtractVarPreview[],
): number {
  return buildPostmanVariablePreview(config, extractVars).length;
}

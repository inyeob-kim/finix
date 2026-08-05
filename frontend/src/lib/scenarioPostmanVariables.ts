import type { StepBindingsByStepKey } from "@/lib/scenarioBindings";
import { resolveCollectionVarValue } from "@/lib/collectionVarGenerators";
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
  /** Built-in generator id; when set, Live/export resolves instead of using value. */
  generator?: string | null;
};

export type ScenarioPostmanConfig = {
  baseUrl: string;
  /** BXM channel fields for x-bxm-systemheader only. */
  headerVars: PostmanStartVar[];
  /** Scenario-global collection variables (may reuse header key names). */
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

/** Platform header variables (UI channel keys + hidden lngCd). */
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

/** Channel fields shown in header-variable settings UI. */
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

/** Header keys that belong in header_vars, not default_headers. */
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

export function defaultBxmHeaderVarRows(): PostmanStartVar[] {
  const today = fccTxDateToday();
  return BXM_PLATFORM_VAR_DEFAULTS.map((row) =>
    newStartVarFromTemplate(
      row.key,
      row.key === "txDt" ? today : row.value,
    ),
  );
}

/** @deprecated Use defaultBxmHeaderVarRows */
export function defaultBxmStartVarRows(): PostmanStartVar[] {
  return defaultBxmHeaderVarRows();
}

/** Ensure BXM header variables exist (user values win). */
export function ensureBxmHeaderVars(
  headerVars: PostmanStartVar[] | undefined,
): PostmanStartVar[] {
  const byKey = new Map<string, PostmanStartVar>();
  for (const row of defaultBxmHeaderVarRows()) {
    byKey.set(row.key, row);
  }
  for (const row of headerVars ?? []) {
    const k = row.key.trim();
    if (!k || !BXM_VAR_KEY_SET.has(k)) continue;
    byKey.set(k, { ...row, key: k });
  }
  const staff = byKey.get("staffId");
  if (staff?.value.trim() === LEGACY_STAFF_ID_DEFAULT) {
    byKey.set("staffId", { ...staff, value: "1100000013" });
  }
  const tx = byKey.get("txDt");
  if (tx && !tx.value.trim()) {
    byKey.set("txDt", { ...tx, value: fccTxDateToday() });
  }
  return BXM_PLATFORM_VAR_DEFAULTS.map((row) => byKey.get(row.key)!);
}

/** @deprecated Use ensureBxmHeaderVars — no longer merges collection vars. */
export function ensureBxmStartVars(
  startVars: PostmanStartVar[] | undefined,
): PostmanStartVar[] {
  const headerFromLegacy = (startVars ?? []).filter((row) =>
    BXM_VAR_KEY_SET.has(row.key.trim()),
  );
  const customs = (startVars ?? []).filter(
    (row) => row.key.trim() && !BXM_VAR_KEY_SET.has(row.key.trim()),
  );
  return [...ensureBxmHeaderVars(headerFromLegacy), ...customs];
}

function splitLegacyFlatStartVars(startVars: PostmanStartVar[]): {
  headerVars: PostmanStartVar[];
  startVars: PostmanStartVar[];
} {
  const headerSource: PostmanStartVar[] = [];
  const collection: PostmanStartVar[] = [];
  const seenCollection = new Set<string>();
  for (const row of startVars) {
    const k = row.key.trim();
    if (!k) continue;
    if (BXM_VAR_KEY_SET.has(k)) {
      headerSource.push({ ...row, key: k });
    } else if (!seenCollection.has(k)) {
      seenCollection.add(k);
      collection.push({ ...row, key: k });
    }
  }
  return {
    headerVars: ensureBxmHeaderVars(headerSource),
    startVars: collection,
  };
}

export type PostmanConfigNormalizeResult = {
  config: ScenarioPostmanConfig;
  migratedHeaderCount: number;
};

/** Strip BXM channel keys from headers; migrate literal values into header_vars. */
export function normalizePostmanConfigWithMeta(
  config: ScenarioPostmanConfig,
): PostmanConfigNormalizeResult {
  const startHasBxm = (config.startVars ?? []).some((row) =>
    BXM_VAR_KEY_SET.has(row.key.trim()),
  );
  const hasExplicitHeaderVars = (config.headerVars?.length ?? 0) > 0;
  const useLegacySplit = !hasExplicitHeaderVars && startHasBxm;

  let headerVars = useLegacySplit
    ? splitLegacyFlatStartVars(config.startVars).headerVars
    : ensureBxmHeaderVars(config.headerVars);
  let startVars = useLegacySplit
    ? splitLegacyFlatStartVars(config.startVars).startVars
    : dedupeStartVars(config.startVars ?? []);

  const headers = config.defaultHeaders ?? [];
  const reservedHeaders = headers.filter((h) =>
    isBxmReservedHeaderKey(h.key.trim()),
  );

  for (const h of reservedHeaders) {
    const k = h.key.trim();
    const v = h.value.trim();
    if (!v || isPostmanPlaceholderValue(v)) continue;
    headerVars = headerVars.map((row) =>
      row.key.trim() === k ? { ...row, value: v } : row,
    );
  }

  headerVars = ensureBxmHeaderVars(headerVars);

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
      headerVars,
      startVars,
      defaultHeaders: cleanHeaders,
    },
    migratedHeaderCount: reservedHeaders.length,
  };
}

function dedupeStartVars(rows: PostmanStartVar[]): PostmanStartVar[] {
  const seen = new Set<string>();
  const out: PostmanStartVar[] = [];
  for (const row of rows) {
    const k = row.key.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ ...row, key: k });
  }
  return out;
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
    (config.headerVars ?? []).map((row) => [row.key.trim(), row] as const),
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
  return {
    channelVars,
    customVars: dedupeStartVars(config.startVars ?? []),
  };
}

export function updateHeaderVarValue(
  config: ScenarioPostmanConfig,
  varKey: string,
  value: string,
): ScenarioPostmanConfig {
  const k = varKey.trim();
  return {
    ...config,
    headerVars: ensureBxmHeaderVars(
      (config.headerVars ?? []).map((row) =>
        row.key.trim() === k ? { ...row, value } : row,
      ),
    ),
  };
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
  return {
    ...config,
    headerVars: ensureBxmHeaderVars(config.headerVars),
    startVars: dedupeStartVars(customVars),
  };
}

export function emptyPostmanConfig(): ScenarioPostmanConfig {
  return {
    baseUrl: "",
    headerVars: defaultBxmHeaderVarRows(),
    startVars: [],
    defaultHeaders: [
      {
        id: crypto.randomUUID(),
        key: "Content-Type",
        value: "application/json",
      },
    ],
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
    headerVars: config.headerVars ?? [],
    startVars: config.startVars ?? [],
    defaultHeaders: migrateLegacyPostmanHeaders(
      ensureDefaultHeaders(config.defaultHeaders),
    ),
  });
}

/** True when postman block should be written to scenario steps_json envelope. */
export function hasPersistablePostmanConfig(config: ScenarioPostmanConfig): boolean {
  const postman = postmanConfigToApi(config);
  return (
    postman.header_vars.length > 0 ||
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

/** Collection vars shown on Input body chips (includes keys that also exist as header vars). */
export function startVarKeysForBodyChips(config: ScenarioPostmanConfig): string[] {
  return startVarKeysFromConfig(config);
}

/** Add or update a collection variable (header key names allowed). */
export function upsertCustomStartVar(
  config: ScenarioPostmanConfig,
  key: string,
  valueOrOpts: string | { value?: string; generator?: string | null } = "",
): ScenarioPostmanConfig {
  const k = key.trim();
  if (!k) return config;
  const opts =
    typeof valueOrOpts === "string"
      ? { value: valueOrOpts, generator: null as string | null }
      : valueOrOpts;
  const generator = (opts.generator ?? "").trim() || null;
  const value = generator ? "" : (opts.value ?? "").trim();
  if (!generator && !value) return config;

  const customVars = splitStartVarsForUi(config).customVars;
  const idx = customVars.findIndex((r) => r.key.trim() === k);
  const nextRow: PostmanStartVar =
    idx >= 0
      ? {
          ...customVars[idx]!,
          key: k,
          value: generator ? "" : value || customVars[idx]!.value,
          generator,
        }
      : {
          ...newStartVarFromTemplate(k, value),
          generator,
        };
  const nextCustom =
    idx >= 0
      ? customVars.map((r, i) => (i === idx ? nextRow : r))
      : [...customVars, nextRow];
  return replaceCustomStartVars(config, nextCustom);
}

export function startVarContextFromConfig(
  config: ScenarioPostmanConfig,
): Record<string, string> {
  const out: Record<string, string> = {};
  const cache: {
    family?: string;
    given?: string;
    middle?: string;
    full?: string;
  } = {};
  for (const row of config.startVars) {
    const k = row.key.trim();
    if (!k) continue;
    out[k] = resolveCollectionVarValue(row, cache);
  }
  return out;
}

export function newStartVar(): PostmanStartVar {
  return { id: crypto.randomUUID(), key: "", value: "" };
}

export function newStartVarFromTemplate(
  key: string,
  value = "",
  generator: string | null = null,
): PostmanStartVar {
  return {
    id: crypto.randomUUID(),
    key: key.trim(),
    value: generator ? "" : value,
    generator,
  };
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

export function removeCustomStartVar(
  config: ScenarioPostmanConfig,
  key: string,
): ScenarioPostmanConfig {
  const k = key.trim();
  if (!k) return config;
  return replaceCustomStartVars(
    config,
    splitStartVarsForUi(config).customVars.filter((r) => r.key.trim() !== k),
  );
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
      value: resolveCollectionVarValue(sv),
      kind: "start",
      hint:
        sv.description?.trim() ||
        (sv.generator ? `동적 · ${sv.generator}` : "실행 전 값"),
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
  header_vars: Array<{
    key: string;
    value: string;
    description?: string;
    generator?: string;
  }>;
  start_vars: Array<{
    key: string;
    value: string;
    description?: string;
    generator?: string;
  }>;
  default_headers: Array<{ key: string; value: string }>;
} {
  const normalized = normalizePostmanConfig(config);
  const toRows = (rows: PostmanStartVar[]) =>
    rows
      .map((r) => {
        const generator = (r.generator ?? "").trim() || undefined;
        return {
          key: r.key.trim(),
          value: generator ? "" : r.value,
          description: r.description?.trim() || undefined,
          generator,
        };
      })
      .filter((r) => r.key.length > 0);
  return {
    base_url: normalized.baseUrl.trim(),
    header_vars: toRows(normalized.headerVars).map(
      ({ generator: _g, ...rest }) => rest,
    ),
    start_vars: toRows(normalized.startVars),
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
  header_vars?: Array<{
    key: string;
    value?: string;
    description?: string | null;
    generator?: string | null;
  }>;
  start_vars?: Array<{
    key: string;
    value?: string;
    description?: string | null;
    generator?: string | null;
  }>;
  default_headers?: Array<{ key: string; value?: string }>;
} | null | undefined): ScenarioPostmanConfig {
  if (!raw) return emptyPostmanConfig();
  const mapRows = (
    rows: Array<{
      key: string;
      value?: string;
      description?: string | null;
      generator?: string | null;
    }>,
  ) =>
    rows.map((r) => ({
      id: crypto.randomUUID(),
      key: r.key,
      value: r.value ?? "",
      description: r.description?.trim() || undefined,
      generator: (r.generator ?? "").trim() || null,
    }));
  const headerRows = (raw.default_headers ?? []).map((r) => ({
    id: crypto.randomUUID(),
    key: r.key,
    value: r.value ?? "",
  }));
  return normalizePostmanConfig({
    baseUrl: raw.base_url?.trim() ?? "",
    headerVars: mapRows(raw.header_vars ?? []),
    startVars: mapRows(raw.start_vars ?? []),
    defaultHeaders: ensureDefaultHeaders(headerRows),
  });
}

export function countPostmanVariables(
  config: ScenarioPostmanConfig,
  extractVars: ExtractVarPreview[],
): number {
  return buildPostmanVariablePreview(config, extractVars).length;
}

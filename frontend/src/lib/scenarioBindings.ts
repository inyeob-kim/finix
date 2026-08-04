/** Declarative extract/inject between scenario steps (aligned with backend). */

import { collectDotPaths, getByDotPath, setByDotPath } from "@/lib/jsonDotPaths";

export type BindingExtractSpec = {
  var: string;
  json_path: string;
};

export type BindingInjectSpec = {
  var: string;
  json_path: string;
};

export type BindingOverrideSpec = {
  json_path: string;
  value: unknown;
};

export type StepBindingConfig = {
  extracts: BindingExtractSpec[];
  injects: BindingInjectSpec[];
  overrides: BindingOverrideSpec[];
};

export type StepBindingsByServiceCode = Record<string, StepBindingConfig>;

/** Bindings keyed by testcase pick id (``ScenarioRunStep.stepKey``). */
export type StepBindingsByStepKey = Record<string, StepBindingConfig>;

export function emptyStepBinding(): StepBindingConfig {
  return { extracts: [], injects: [], overrides: [] };
}

export function ensureBindingsForSequence(
  codes: string[],
  prev: StepBindingsByServiceCode | undefined,
): StepBindingsByServiceCode {
  const next: StepBindingsByServiceCode = {};
  for (const code of codes) {
    next[code] = prev?.[code] ?? emptyStepBinding();
  }
  return next;
}

export function ensureBindingsForRunSteps(
  stepKeys: string[],
  prev: StepBindingsByStepKey | StepBindingsByServiceCode | undefined,
): StepBindingsByStepKey {
  const next: StepBindingsByStepKey = {};
  for (const key of stepKeys) {
    next[key] = prev?.[key] ?? emptyStepBinding();
  }
  return next;
}

/** Map legacy service-code bindings onto first matching pick per code. */
export function migrateBindingsToStepKeys(
  stepKeys: string[],
  picks: Array<{ id: string; serviceCode: string }>,
  prev: StepBindingsByServiceCode | undefined,
): StepBindingsByStepKey {
  const next = ensureBindingsForRunSteps(stepKeys, prev);
  if (!prev) return next;
  const used = new Set(
    Object.keys(next).filter(
      (k) =>
        next[k]?.extracts?.length ||
        next[k]?.injects?.length ||
        next[k]?.overrides?.length,
    ),
  );
  for (const pick of picks) {
    if (used.has(pick.id)) continue;
    const legacy = prev[pick.serviceCode];
    if (
      legacy &&
      (legacy.extracts.length > 0 ||
        legacy.injects.length > 0 ||
        (legacy.overrides?.length ?? 0) > 0)
    ) {
      next[pick.id] = {
        ...emptyStepBinding(),
        ...legacy,
        overrides: legacy.overrides ?? [],
      };
    }
  }
  return next;
}

/** Apply API suggestion onto the wizard binding map (replaces rows per service). */
export function bindingsFromSuggestion(
  codes: string[],
  bindingsByService: Record<
    string,
    { extracts: BindingExtractSpec[]; injects: BindingInjectSpec[] }
  >,
): StepBindingsByServiceCode {
  const next = ensureBindingsForSequence(codes, {});
  for (const code of codes) {
    const block = bindingsByService[code];
    if (!block) continue;
    next[code] = {
      extracts: block.extracts.map((r) => ({
        var: r.var,
        json_path: stripBindingPathForInput(
          normalizeBindingPathForApi(r.json_path),
        ),
      })),
      injects: block.injects.map((r) => ({
        var: r.var,
        json_path: stripBindingPathForInput(
          normalizeBindingPathForApi(r.json_path),
        ),
      })),
    };
  }
  return next;
}

export function countBindingRows(
  bindings: StepBindingsByServiceCode | StepBindingsByStepKey | undefined,
): number {
  if (!bindings) return 0;
  return Object.values(bindings).reduce(
    (n, b) => n + b.extracts.length + b.injects.length + (b.overrides?.length ?? 0),
    0,
  );
}

/** Strip ``$.`` for display in path inputs (user types ``data.token`` only). */
export function stripBindingPathForInput(stored: string): string {
  const raw = (stored || "").trim();
  if (raw.startsWith("$.")) return raw.slice(2);
  if (raw.startsWith("$")) return raw.slice(1).replace(/^\./, "");
  return raw;
}

/** Normalize to ``$.segment`` before API; brackets ``a[0].b`` → ``$.a.0.b``. */
export function normalizeBindingPathForApi(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  let body = raw;
  if (body.startsWith("$.")) body = body.slice(2);
  else if (body.startsWith("$")) body = body.slice(1).replace(/^\./, "");
  const parts = body.match(/[^.\[\]]+/g)?.filter(Boolean) ?? [];
  if (parts.length === 0) return raw === "$" || raw === "$." ? "$" : "";
  return `$.${parts.join(".")}`;
}

function cleanRows<T extends { var: string; json_path: string }>(rows: T[]): T[] {
  return rows
    .filter((r) => r.var.trim() && r.json_path.trim())
    .map((r) => ({
      ...r,
      var: r.var.trim(),
      json_path: normalizeBindingPathForApi(
        stripBindingPathForInput(r.json_path),
      ),
    }));
}

function cleanOverrideRows(rows: BindingOverrideSpec[]): BindingOverrideSpec[] {
  return rows
    .filter((r) => r.json_path.trim())
    .map((r) => ({
      json_path: normalizeBindingPathForApi(
        stripBindingPathForInput(r.json_path),
      ),
      value: r.value,
    }));
}

/** One row per variable name — replaces path when the same var is picked again. */
export function upsertBindingRow(
  cfg: StepBindingConfig,
  kind: "extracts" | "injects",
  varName: string,
  path: string,
): StepBindingConfig {
  const row = {
    var: varName.trim(),
    json_path: stripBindingPathForInput(normalizeBindingPathForApi(path)),
  };
  if (!row.var || !row.json_path) return cfg;
  const rows = [...cfg[kind]];
  const idx = rows.findIndex((r) => r.var.trim() === row.var);
  if (idx >= 0) rows[idx] = row;
  else rows.push(row);
  return { ...cfg, [kind]: rows };
}

export function upsertExtract(
  bindings: StepBindingsByStepKey,
  stepKey: string,
  varName: string,
  path: string,
): StepBindingsByStepKey {
  const cfg = bindings[stepKey] ?? emptyStepBinding();
  return { ...bindings, [stepKey]: upsertBindingRow(cfg, "extracts", varName, path) };
}

export function upsertInject(
  bindings: StepBindingsByStepKey,
  stepKey: string,
  varName: string,
  path: string,
): StepBindingsByStepKey {
  const cfg = bindings[stepKey] ?? emptyStepBinding();
  return { ...bindings, [stepKey]: upsertBindingRow(cfg, "injects", varName, path) };
}

/** Normalized path key for comparing extract/inject rows. */
export function bindingPathKey(path: string): string {
  return stripBindingPathForInput(normalizeBindingPathForApi(path)).toLowerCase();
}

export function removeBindingRowsByPath(
  cfg: StepBindingConfig,
  kind: "extracts" | "injects" | "overrides",
  path: string,
): StepBindingConfig {
  const key = bindingPathKey(path);
  if (!key) return cfg;
  return {
    ...cfg,
    [kind]: cfg[kind].filter((r) => bindingPathKey(r.json_path) !== key),
  };
}

export function removeExtractByPath(
  bindings: StepBindingsByStepKey,
  stepKey: string,
  path: string,
): StepBindingsByStepKey {
  const cfg = bindings[stepKey] ?? emptyStepBinding();
  return { ...bindings, [stepKey]: removeBindingRowsByPath(cfg, "extracts", path) };
}

/** Replace extract variable name at a response path (also removes prior var row for that path). */
export function setExtractVarAtPath(
  bindings: StepBindingsByStepKey,
  stepKey: string,
  responsePath: string,
  varName: string,
): StepBindingsByStepKey {
  const v = varName.trim();
  if (!v) return bindings;
  const cfg = bindings[stepKey] ?? emptyStepBinding();
  const cleared = removeBindingRowsByPath(cfg, "extracts", responsePath);
  return {
    ...bindings,
    [stepKey]: upsertBindingRow(cleared, "extracts", v, responsePath),
  };
}

export function extractVarAtPath(
  cfg: StepBindingConfig,
  responsePath: string,
): string | null {
  const key = bindingPathKey(responsePath);
  if (!key) return null;
  const row = cfg.extracts.find((r) => bindingPathKey(r.json_path) === key);
  return row?.var.trim() || null;
}

export function removeInjectByPath(
  bindings: StepBindingsByStepKey,
  stepKey: string,
  path: string,
): StepBindingsByStepKey {
  const cfg = bindings[stepKey] ?? emptyStepBinding();
  return { ...bindings, [stepKey]: removeBindingRowsByPath(cfg, "injects", path) };
}

export function findInjectRequestPath(
  cfg: StepBindingConfig,
  varName: string,
): string | null {
  const v = varName.trim();
  if (!v) return null;
  const row = cfg.injects.find((r) => r.var.trim() === v);
  return row ? stripBindingPathForInput(row.json_path) : null;
}

/** Remove inject row by variable name (one row per var per step). */
export function removeInjectByVar(
  bindings: StepBindingsByStepKey,
  stepKey: string,
  varName: string,
): StepBindingsByStepKey {
  const v = varName.trim();
  if (!v) return bindings;
  const cfg = bindings[stepKey] ?? emptyStepBinding();
  return {
    ...bindings,
    [stepKey]: {
      ...cfg,
      injects: cfg.injects.filter((r) => r.var.trim() !== v),
    },
  };
}

export function injectVarAtRequestPath(
  cfg: StepBindingConfig,
  requestPath: string,
): string | null {
  const key = bindingPathKey(requestPath);
  if (!key) return null;
  const row = cfg.injects.find((r) => bindingPathKey(r.json_path) === key);
  return row?.var.trim() || null;
}

export function isInjectConnectedAtPath(
  cfg: StepBindingConfig,
  requestPath: string,
  runtimeVar: string,
): boolean {
  const key = bindingPathKey(requestPath);
  const v = runtimeVar.trim();
  if (!key || !v) return false;
  return cfg.injects.some(
    (r) => bindingPathKey(r.json_path) === key && r.var.trim() === v,
  );
}

export function parseOverrideValueInput(raw: string): unknown {
  const t = raw.trim();
  if (!t) return "";
  if (t === "null") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

export function formatOverrideValueForInput(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function upsertOverride(
  bindings: StepBindingsByStepKey,
  stepKey: string,
  path: string,
  value: unknown,
): StepBindingsByStepKey {
  const cfg = bindings[stepKey] ?? emptyStepBinding();
  const row = {
    json_path: stripBindingPathForInput(normalizeBindingPathForApi(path)),
    value,
  };
  if (!row.json_path) return bindings;
  const key = bindingPathKey(row.json_path);
  const rows = cfg.overrides.filter((r) => bindingPathKey(r.json_path) !== key);
  rows.push(row);
  return { ...bindings, [stepKey]: { ...cfg, overrides: rows } };
}

export function removeOverrideByPath(
  bindings: StepBindingsByStepKey,
  stepKey: string,
  path: string,
): StepBindingsByStepKey {
  const cfg = bindings[stepKey] ?? emptyStepBinding();
  return {
    ...bindings,
    [stepKey]: removeBindingRowsByPath(cfg, "overrides", path),
  };
}

export function overrideAtPath(
  cfg: StepBindingConfig,
  requestPath: string,
): BindingOverrideSpec | null {
  const key = bindingPathKey(requestPath);
  if (!key) return null;
  return cfg.overrides.find((r) => bindingPathKey(r.json_path) === key) ?? null;
}

/** Template request body with current scenario overrides applied (for JSON editor). */
export function mergeTemplateWithOverrides(
  template: Record<string, unknown>,
  overrides: BindingOverrideSpec[],
): Record<string, unknown> {
  let body = structuredClone(template);
  for (const row of overrides) {
    const p = stripBindingPathForInput(row.json_path);
    if (!p) continue;
    body = setByDotPath(body, p, row.value);
  }
  return body;
}

/** Diff desired execution body vs template → override rows (changed leaves only). */
export function overridesFromBodyDiff(
  template: Record<string, unknown>,
  desired: Record<string, unknown>,
): BindingOverrideSpec[] {
  const rows: BindingOverrideSpec[] = [];
  for (const path of collectDotPaths(desired, "", 8, 200)) {
    const newVal = getByDotPath(desired, path);
    const oldVal = getByDotPath(template, path);
    if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
      rows.push({
        json_path: normalizeBindingPathForApi(path),
        value: newVal,
      });
    }
  }
  return cleanOverrideRows(rows);
}

export function setStepOverrides(
  bindings: StepBindingsByStepKey,
  stepKey: string,
  overrides: BindingOverrideSpec[],
): StepBindingsByStepKey {
  const cfg = bindings[stepKey] ?? emptyStepBinding();
  return {
    ...bindings,
    [stepKey]: { ...cfg, overrides: cleanOverrideRows(overrides) },
  };
}

/** Last row wins when legacy data has duplicate variable names. */
export function dedupeBindingRowsByVar<T extends { var: string }>(
  rows: T[],
): T[] {
  const byVar = new Map<string, T>();
  for (const row of rows) {
    const v = row.var.trim();
    if (v) byVar.set(v, row);
  }
  return [...byVar.values()];
}

/** Build API scenario steps — one row per run step (testcase order). */
export function buildScenarioStepsWithBindings(
  sequence: Array<{
    stepKey: string;
    code: string;
    name: string;
    title?: string;
  }>,
  bindings: StepBindingsByStepKey | StepBindingsByServiceCode | undefined,
): Array<{
  id: string;
  number: number;
  action: string;
  result: "success";
  reason: string;
  service_code: string;
  extracts: BindingExtractSpec[];
  injects: BindingInjectSpec[];
  overrides: BindingOverrideSpec[];
}> {
  return sequence.map((s, idx) => {
    const cfg =
      bindings?.[s.stepKey] ?? bindings?.[s.code] ?? emptyStepBinding();
    return {
      id: crypto.randomUUID(),
      number: idx + 1,
      action: (s.title?.trim() || s.name).slice(0, 255),
      result: "success" as const,
      reason: `code=${s.code}`,
      service_code: s.code,
      extracts: cleanRows(cfg.extracts),
      injects: cleanRows(cfg.injects),
      overrides: cleanOverrideRows(cfg.overrides ?? []),
    };
  });
}

/** Apply AI suggestion using link indices aligned to run-step order. */
export function bindingsFromSuggestionLinks(
  runSteps: Array<{ stepKey: string }>,
  links: Array<{
    from_service_index: number;
    to_service_index: number;
    response_path: string;
    request_path: string;
    var: string;
  }>,
  prev?: StepBindingsByStepKey,
  mode: "append" | "replace" = "append",
): StepBindingsByStepKey {
  const keys = runSteps.map((s) => s.stepKey);
  let next =
    mode === "replace"
      ? ensureBindingsForRunSteps(keys, {})
      : ensureBindingsForRunSteps(keys, prev);

  for (const link of links) {
    const prevStep = runSteps[link.from_service_index];
    const curStep = runSteps[link.to_service_index];
    if (!prevStep || !curStep) continue;
    if (link.response_path) {
      next = upsertExtract(
        next,
        prevStep.stepKey,
        link.var,
        link.response_path,
      );
    }
    if (link.request_path) {
      next = upsertInject(next, curStep.stepKey, link.var, link.request_path);
    }
  }
  return next;
}

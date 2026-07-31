/** Postman-style body ↔ extract/inject/override mapping. */

import { collectDotPaths, getByDotPath, setByDotPath } from "@/lib/jsonDotPaths";
import {
  emptyStepBinding,
  normalizeBindingPathForApi,
  stripBindingPathForInput,
  type BindingInjectSpec,
  type BindingOverrideSpec,
  type StepBindingConfig,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import type { ScenarioRunStep } from "@/lib/scenarioRunSequence";

const POSTMAN_VAR_RE = /^\{\{\s*([A-Za-z_][\w]*)\s*\}\}$/;

export function formatPostmanVar(name: string): string {
  return `{{${name.trim()}}}`;
}

export function parsePostmanVarToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = POSTMAN_VAR_RE.exec(value.trim());
  return m?.[1] ?? null;
}

/** Template + overrides, with inject paths shown as ``{{var}}``. */
export function bodyForPostmanEditor(
  template: Record<string, unknown>,
  overrides: BindingOverrideSpec[],
  injects: BindingInjectSpec[],
): Record<string, unknown> {
  let body = structuredClone(template);
  for (const row of overrides) {
    const p = stripBindingPathForInput(row.json_path);
    if (!p) continue;
    body = setByDotPath(body, p, row.value);
  }
  for (const row of injects) {
    const p = stripBindingPathForInput(row.json_path);
    const v = row.var.trim();
    if (!p || !v) continue;
    body = setByDotPath(body, p, formatPostmanVar(v));
  }
  return body;
}

export type ParsedPostmanBody = {
  overrides: BindingOverrideSpec[];
  injects: BindingInjectSpec[];
};

/** Diff edited body vs template → literal overrides + ``{{var}}`` injects. */
export function parsePostmanBody(
  template: Record<string, unknown>,
  desired: Record<string, unknown>,
): ParsedPostmanBody {
  const overrides: BindingOverrideSpec[] = [];
  const injects: BindingInjectSpec[] = [];
  const injectPaths = new Set<string>();

  for (const path of collectDotPaths(desired, "", 8, 200)) {
    const newVal = getByDotPath(desired, path);
    const varName = parsePostmanVarToken(newVal);
    if (varName) {
      injects.push({
        var: varName,
        json_path: normalizeBindingPathForApi(path),
      });
      injectPaths.add(path);
      continue;
    }
    const oldVal = getByDotPath(template, path);
    if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
      overrides.push({
        json_path: normalizeBindingPathForApi(path),
        value: newVal,
      });
    }
  }

  // Drop overrides that collide with inject paths (inject wins).
  const cleanOverrides = overrides.filter(
    (r) => !injectPaths.has(stripBindingPathForInput(r.json_path)),
  );

  return {
    overrides: cleanOverrides,
    injects: dedupeInjects(injects),
  };
}

function dedupeInjects(rows: BindingInjectSpec[]): BindingInjectSpec[] {
  const byPath = new Map<string, BindingInjectSpec>();
  for (const row of rows) {
    const key = stripBindingPathForInput(row.json_path);
    if (!key || !row.var.trim()) continue;
    byPath.set(key, {
      var: row.var.trim(),
      json_path: normalizeBindingPathForApi(key),
    });
  }
  return [...byPath.values()];
}

export function setStepPostmanBodyBindings(
  bindings: StepBindingsByStepKey,
  stepKey: string,
  parsed: ParsedPostmanBody,
): StepBindingsByStepKey {
  const cfg = bindings[stepKey] ?? emptyStepBinding();
  const next: StepBindingConfig = {
    extracts: cfg.extracts,
    injects: parsed.injects,
    overrides: parsed.overrides,
  };
  return { ...bindings, [stepKey]: next };
}

export type AvailablePostmanVar = {
  name: string;
  /** Compact origin mark: ``S`` (Start) or ``TC1`` / ``TC2`` (step order). */
  origin: string;
  /** Hover detail (case id / Start). */
  detail: string;
};

/** Collection vars + extracts from earlier steps only (not current step). */
export function listAvailablePostmanVars(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  startVarKeys: readonly string[],
  stepIndex: number,
): AvailablePostmanVar[] {
  const out: AvailablePostmanVar[] = [];
  const seen = new Set<string>();

  const push = (name: string, origin: string, detail: string) => {
    const n = name.trim();
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push({ name: n, origin, detail });
  };

  for (const k of startVarKeys) {
    push(k, "S", "컬렉션");
  }

  for (let i = 0; i < stepIndex && i < runSteps.length; i++) {
    const step = runSteps[i];
    if (!step) continue;
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    const detail = step.ruleId?.trim() || step.serviceCode || `step ${i + 1}`;
    for (const row of cfg.extracts) {
      push(row.var, `TC${i + 1}`, detail);
    }
  }

  return out;
}

/** Group vars by compact origin for chip rows. */
export function groupAvailablePostmanVars(
  vars: AvailablePostmanVar[],
): Array<{ origin: string; detail: string; vars: AvailablePostmanVar[] }> {
  const order: string[] = [];
  const map = new Map<string, AvailablePostmanVar[]>();
  const detailByOrigin = new Map<string, string>();
  for (const v of vars) {
    if (!map.has(v.origin)) {
      order.push(v.origin);
      map.set(v.origin, []);
      detailByOrigin.set(v.origin, v.detail);
    }
    map.get(v.origin)!.push(v);
  }
  return order.map((origin) => ({
    origin,
    detail: detailByOrigin.get(origin) ?? origin,
    vars: map.get(origin) ?? [],
  }));
}

import {
  bindingPathKey,
  emptyStepBinding,
  extractVarAtPath,
  removeExtractByPath,
  setExtractVarAtPath,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import { fieldVarNameFromPath, findExtractSource } from "@/lib/scenarioConnectionUx";
import {
  runStepCaseIdLabel,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";

export type VarNameTakenOptions = {
  /** Ignore extract on this step at this response path (re-pick / rename). */
  exceptStepKey?: string;
  exceptResponsePath?: string;
};

function normVar(name: string): string {
  return name.trim().toLowerCase();
}

/** All variable names already reserved (extracts, collection start vars). */
export function collectTakenVarNames(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  startVarKeys: readonly string[] = [],
  options?: VarNameTakenOptions,
): Set<string> {
  const taken = new Set<string>();
  const exceptKey = options?.exceptStepKey;
  const exceptPath = options?.exceptResponsePath
    ? bindingPathKey(options.exceptResponsePath)
    : "";

  for (const key of startVarKeys) {
    const k = normVar(key);
    if (k) taken.add(k);
  }

  runSteps.forEach((step) => {
    const cfg = bindings[step.stepKey];
    for (const ex of cfg?.extracts ?? []) {
      const v = normVar(ex.var);
      if (!v) continue;
      if (
        exceptKey &&
        step.stepKey === exceptKey &&
        exceptPath &&
        bindingPathKey(ex.json_path) === exceptPath
      ) {
        continue;
      }
      taken.add(v);
    }
  });

  return taken;
}

export function isVarNameTaken(
  varName: string,
  taken: Set<string>,
): boolean {
  const k = normVar(varName);
  return Boolean(k && taken.has(k));
}

function capitalizeLeaf(leaf: string): string {
  if (!leaf) return "Value";
  return leaf.charAt(0).toUpperCase() + leaf.slice(1);
}

/** Suggest unique semantic names when the default leaf name collides. */
export function suggestAlternateVarNames(
  baseName: string,
  taken: Set<string>,
  sourceStepIndex: number,
  runSteps: ScenarioRunStep[],
): string[] {
  const leaf = baseName.trim() || "value";
  const step = runSteps[sourceStepIndex];
  const svc = (step?.serviceCode ?? "step")
    .replace(/[^A-Za-z0-9]+/g, "")
    .slice(0, 12);
  const tc = `TC${sourceStepIndex + 1}`;
  const candidates = [
    `${leaf}_${tc}`,
    `${tc}_${leaf}`,
    `${leaf}Step${sourceStepIndex + 1}`,
    `${svc}_${leaf}`,
    `from${capitalizeLeaf(leaf)}`,
    `to${capitalizeLeaf(leaf)}`,
    `${leaf}_${sourceStepIndex + 1}`,
    `src${capitalizeLeaf(leaf)}`,
  ];

  const out: string[] = [];
  for (const c of candidates) {
    if (!isVarNameTaken(c, taken) && !out.includes(c)) out.push(c);
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * Always scope extract vars by step: ``acctNbr_TC1``, ``acctNbr_TC2``, …
 * So TC1/TC2 can both expose the same response field without collisions.
 */
export function allocateUniqueExtractVarName(input: {
  responsePath: string;
  preferredName?: string;
  runSteps: ScenarioRunStep[];
  bindings: StepBindingsByStepKey;
  sourceStepIndex: number;
  /** @deprecated Ignored — names are always step-scoped. */
  startVarKeys?: readonly string[];
  exceptResponsePath?: string;
}): string {
  const leaf =
    defaultExtractVarName(input.responsePath).replace(/_TC\d+$/i, "") ||
    "value";
  const scoped = `${leaf}_TC${input.sourceStepIndex + 1}`;
  const sourceStep = input.runSteps[input.sourceStepIndex];
  const taken = collectTakenVarNames(
    input.runSteps,
    input.bindings,
    [],
    {
      exceptStepKey: sourceStep?.stepKey,
      exceptResponsePath:
        input.exceptResponsePath ?? input.responsePath,
    },
  );
  if (!isVarNameTaken(scoped, taken)) return scoped;

  const alts = suggestAlternateVarNames(
    leaf,
    taken,
    input.sourceStepIndex,
    input.runSteps,
  );
  if (alts[0]) return alts[0];

  let n = 2;
  while (n < 100) {
    const candidate = `${scoped}_${n}`;
    if (!isVarNameTaken(candidate, taken)) return candidate;
    n += 1;
  }
  return `${scoped}_${Date.now()}`;
}

export function defaultExtractVarName(responsePath: string): string {
  return fieldVarNameFromPath(responsePath);
}

export function findExtractVarOwnerStep(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  varName: string,
): { stepIndex: number; stepLabel: string } | null {
  const target = normVar(varName);
  if (!target) return null;
  for (let i = 0; i < runSteps.length; i++) {
    const cfg = bindings[runSteps[i].stepKey];
    if (cfg?.extracts.some((ex) => normVar(ex.var) === target)) {
      return {
        stepIndex: i,
        stepLabel: runStepCaseIdLabel(runSteps[i]),
      };
    }
  }
  return null;
}

export function injectVarDisplayLabel(
  varName: string,
  generatedAtStepIndex: number,
  runSteps: ScenarioRunStep[],
): string {
  if (generatedAtStepIndex < 0) return varName;
  const step = runSteps[generatedAtStepIndex];
  const stepLabel = step
    ? runStepCaseIdLabel(step)
    : `${generatedAtStepIndex + 1}단계`;
  return `${varName} · ${stepLabel}`;
}

export function renameExtractVarInScenario(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  sourceStepIndex: number,
  responsePath: string,
  newVarName: string,
): StepBindingsByStepKey {
  const sourceStep = runSteps[sourceStepIndex];
  if (!sourceStep) return bindings;
  const cfg = bindings[sourceStep.stepKey] ?? emptyStepBinding();
  const oldVar = extractVarAtPath(cfg, responsePath);
  const nextVar = newVarName.trim();
  if (!oldVar || !nextVar || oldVar === nextVar) {
    return setExtractVarAtPath(bindings, sourceStep.stepKey, responsePath, nextVar);
  }

  let next = setExtractVarAtPath(
    bindings,
    sourceStep.stepKey,
    responsePath,
    nextVar,
  );

  runSteps.forEach((toStep, toIdx) => {
    if (toIdx <= sourceStepIndex) return;
    const toCfg = bindings[toStep.stepKey] ?? emptyStepBinding();
    let changed = false;
    const injects = toCfg.injects.map((inj) => {
      if (inj.var.trim() !== oldVar) return inj;
      const src = findExtractSource(runSteps, bindings, oldVar, toIdx);
      if (src?.stepIndex !== sourceStepIndex) return inj;
      changed = true;
      return { ...inj, var: nextVar };
    });
    if (changed) {
      const prev = next[toStep.stepKey] ?? emptyStepBinding();
      next = { ...next, [toStep.stepKey]: { ...prev, injects } };
    }
  });

  return next;
}

/** Remove extract and downstream injects that referenced this step as source. */
export function removeExtractAndDependentInjects(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  sourceStepIndex: number,
  responsePath: string,
): StepBindingsByStepKey {
  const sourceStep = runSteps[sourceStepIndex];
  if (!sourceStep) return bindings;
  const cfg = bindings[sourceStep.stepKey] ?? emptyStepBinding();
  const varName = extractVarAtPath(cfg, responsePath);
  let next = removeExtractByPath(bindings, sourceStep.stepKey, responsePath);
  if (!varName) return next;

  runSteps.forEach((toStep, toIdx) => {
    if (toIdx <= sourceStepIndex) return;
    const toCfg = bindings[toStep.stepKey] ?? emptyStepBinding();
    const injects = toCfg.injects.filter((inj) => {
      const v = inj.var.trim();
      if (v !== varName) return true;
      const src = findExtractSource(runSteps, bindings, v, toIdx);
      return src?.stepIndex !== sourceStepIndex;
    });
    if (injects.length < toCfg.injects.length) {
      const merged = next[toStep.stepKey] ?? emptyStepBinding();
      next = { ...next, [toStep.stepKey]: { ...merged, injects } };
    }
  });

  return next;
}

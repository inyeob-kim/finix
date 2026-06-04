import type { SuggestedBindingLinkDto } from "@/api/types";
import {
  emptyStepBinding,
  stripBindingPathForInput,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
  runStepCaseIdLabel,
  runStepRefAt,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";

export type ScenarioVariableRow = {
  var: string;
  savedAt: Array<{ stepIndex: number; caseId: string; path: string }>;
  usedAt: Array<{ stepIndex: number; caseId: string; path: string }>;
};

export type ScenarioRecipeConnection = {
  var: string;
  responsePath: string;
  requestPath: string;
};

export type ScenarioRecipeCard = {
  pairIndex: number;
  fromStep: ScenarioRunStep;
  toStep: ScenarioRunStep;
  connections: ScenarioRecipeConnection[];
};

export type BindingReviewIssue = {
  kind: "orphan_inject" | "unused_extract";
  var: string;
  stepIndex: number;
  caseId: string;
  message: string;
};

export function fieldVarNameFromPath(dotPath: string): string {
  const parts = dotPath.split(".").filter(Boolean);
  return parts[parts.length - 1] ?? "value";
}

/** Connected items first, then stable tie-break (e.g. field name). */
export function sortConnectedFirst<T>(
  items: T[],
  isConnected: (item: T) => boolean,
  tieBreak: (a: T, b: T) => number = () => 0,
): T[] {
  return [...items].sort((a, b) => {
    const order = (isConnected(a) ? 0 : 1) - (isConnected(b) ? 0 : 1);
    if (order !== 0) return order;
    return tieBreak(a, b);
  });
}

export {
  pickBestRequestPathForVar,
  partitionCompatibleRequestPaths,
} from "@/lib/scenarioRuntimeContext";

export function buildScenarioVariables(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
): ScenarioVariableRow[] {
  const byVar = new Map<string, ScenarioVariableRow>();

  const ensure = (name: string) => {
    const key = name.trim();
    if (!key) return null;
    let row = byVar.get(key);
    if (!row) {
      row = { var: key, savedAt: [], usedAt: [] };
      byVar.set(key, row);
    }
    return row;
  };

  runSteps.forEach((step, stepIndex) => {
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    const caseId = runStepCaseIdLabel(step);
    for (const ex of cfg.extracts) {
      const row = ensure(ex.var);
      if (!row) continue;
      row.savedAt.push({
        stepIndex,
        caseId,
        path: stripBindingPathForInput(ex.json_path),
      });
    }
    for (const inj of cfg.injects) {
      const row = ensure(inj.var);
      if (!row) continue;
      row.usedAt.push({
        stepIndex,
        caseId,
        path: stripBindingPathForInput(inj.json_path),
      });
    }
  });

  return [...byVar.values()].sort((a, b) => a.var.localeCompare(b.var));
}

export type ConnectedFlowLink = {
  var: string;
  fromStepIndex: number;
  toStepIndex: number;
  fromServiceCode: string;
  toServiceCode: string;
  responsePath: string;
  requestPath: string;
};

export type RuntimeVariableEntry = {
  var: string;
  generatedAtStepIndex: number;
  generatedFromServiceCode: string;
  responsePath: string;
  usedAtStepIndexes: number[];
  usedByServiceCodes: string[];
};

/** Collection start vars (step 2 / Postman ``variable`` with preset value). */
export const START_VAR_STEP_INDEX = -2;

export function buildStartVarCatalogEntries(
  keys: readonly string[],
): RuntimeVariableEntry[] {
  return keys.map((varName) => ({
    var: varName,
    generatedAtStepIndex: START_VAR_STEP_INDEX,
    generatedFromServiceCode: "collection",
    responsePath: "",
    usedAtStepIndexes: [],
    usedByServiceCodes: [],
  }));
}

export function isStartVarEntry(entry: RuntimeVariableEntry): boolean {
  return entry.generatedAtStepIndex === START_VAR_STEP_INDEX;
}

/** Variable-centric view of execution context (any-step reuse). */
export function buildRuntimeVariableCatalog(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
): RuntimeVariableEntry[] {
  const byVar = new Map<string, RuntimeVariableEntry>();

  runSteps.forEach((step, stepIndex) => {
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    for (const ex of cfg.extracts) {
      const v = ex.var.trim();
      if (!v) continue;
      const path = stripBindingPathForInput(ex.json_path);
      const prev = byVar.get(v);
      if (!prev || stepIndex < prev.generatedAtStepIndex) {
        byVar.set(v, {
          var: v,
          generatedAtStepIndex: stepIndex,
          generatedFromServiceCode: step.serviceCode,
          responsePath: path,
          usedAtStepIndexes: prev?.usedAtStepIndexes ?? [],
          usedByServiceCodes: prev?.usedByServiceCodes ?? [],
        });
      }
    }
  });

  runSteps.forEach((step, stepIndex) => {
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    for (const inj of cfg.injects) {
      const v = inj.var.trim();
      if (!v) continue;
      let entry = byVar.get(v);
      if (!entry) {
        entry = {
          var: v,
          generatedAtStepIndex: -1,
          generatedFromServiceCode: "—",
          responsePath: "",
          usedAtStepIndexes: [],
          usedByServiceCodes: [],
        };
        byVar.set(v, entry);
      }
      if (!entry.usedAtStepIndexes.includes(stepIndex)) {
        entry.usedAtStepIndexes.push(stepIndex);
      }
      if (!entry.usedByServiceCodes.includes(step.serviceCode)) {
        entry.usedByServiceCodes.push(step.serviceCode);
      }
    }
  });

  return [...byVar.values()].sort((a, b) => a.var.localeCompare(b.var));
}

/** Tooltip / chip text for where a variable is saved or consumed. */
export function runtimeVarStepLabels(
  runSteps: ScenarioRunStep[],
  stepIndexes: number[],
): string {
  return stepIndexes
    .map((i) => runStepRefAt(runSteps, i))
    .join(", ");
}

/** Variables from earlier step extracts (not collection start vars). */
export function availableRuntimeVariables(
  catalog: RuntimeVariableEntry[],
  targetStepIndex: number,
): RuntimeVariableEntry[] {
  return catalog.filter(
    (e) =>
      e.generatedAtStepIndex >= 0 &&
      e.generatedAtStepIndex < targetStepIndex,
  );
}

/** Inject targets: collection start vars + prior-step extracts. */
export function availableInjectVariables(
  catalog: RuntimeVariableEntry[],
  targetStepIndex: number,
  startVarKeys: readonly string[],
): RuntimeVariableEntry[] {
  const prior = availableRuntimeVariables(catalog, targetStepIndex);
  const seen = new Set(prior.map((e) => e.var));
  const start = buildStartVarCatalogEntries(startVarKeys).filter(
    (e) => !seen.has(e.var),
  );
  return [...start, ...prior].sort((a, b) => a.var.localeCompare(b.var));
}

export function startInjectVariables(
  startVarKeys: readonly string[],
): RuntimeVariableEntry[] {
  return buildStartVarCatalogEntries(startVarKeys);
}

export function priorStepInjectVariables(
  catalog: RuntimeVariableEntry[],
  targetStepIndex: number,
): RuntimeVariableEntry[] {
  return availableRuntimeVariables(catalog, targetStepIndex);
}

export function findExtractSource(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  varName: string,
  beforeStepIndex: number,
): { stepIndex: number; responsePath: string; serviceCode: string } | null {
  const v = varName.trim();
  for (let j = Math.min(beforeStepIndex, runSteps.length) - 1; j >= 0; j--) {
    const cfg = bindings[runSteps[j].stepKey] ?? emptyStepBinding();
    const ex = cfg.extracts.find((e) => e.var.trim() === v);
    if (ex) {
      return {
        stepIndex: j,
        responsePath: stripBindingPathForInput(ex.json_path),
        serviceCode: runSteps[j].serviceCode,
      };
    }
  }
  return null;
}

export type RuntimeConnectionLink = {
  var: string;
  fromStepIndex: number;
  fromCaseId: string;
  responsePath: string;
  toStepIndex: number;
  toCaseId: string;
  requestPath: string;
  /** Extract exists on an earlier step for this variable. */
  linked: boolean;
};

export type RuntimeSavedOnlyExtract = {
  var: string;
  stepIndex: number;
  caseId: string;
  responsePath: string;
};

/** Inject rows with extract source (any prior step), plus orphan injects. */
export function buildRuntimeConnectionLinks(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  startVarKeys: readonly string[] = [],
): RuntimeConnectionLink[] {
  const startSet = new Set(startVarKeys.map((k) => k.trim()).filter(Boolean));
  const links: RuntimeConnectionLink[] = [];
  runSteps.forEach((toStep, toIdx) => {
    const cfg = bindings[toStep.stepKey] ?? emptyStepBinding();
    for (const inj of cfg.injects) {
      const v = inj.var.trim();
      if (!v) continue;
      const requestPath = stripBindingPathForInput(inj.json_path);
      const fromStart = startSet.has(v);
      const src = fromStart ? null : findExtractSource(runSteps, bindings, v, toIdx);
      links.push({
        var: v,
        fromStepIndex: fromStart ? START_VAR_STEP_INDEX : src?.stepIndex ?? -1,
        fromCaseId: fromStart
          ? "컬렉션 변수"
          : src != null
            ? runStepCaseIdLabel(runSteps[src.stepIndex])
            : "—",
        responsePath: src?.responsePath ?? "",
        toStepIndex: toIdx,
        toCaseId: runStepCaseIdLabel(toStep),
        requestPath,
        linked: fromStart || src != null,
      });
    }
  });
  return links;
}

/** Counts end-to-end links (inject with extract or collection var source). */
export function countLinkedConnections(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  startVarKeys: readonly string[] = [],
): {
  linked: number;
  orphanInjects: number;
  savedOnlyExtracts: number;
} {
  const links = buildRuntimeConnectionLinks(runSteps, bindings, startVarKeys);
  const savedOnly = buildRuntimeSavedOnlyExtracts(runSteps, bindings);
  return {
    linked: links.filter((l) => l.linked).length,
    orphanInjects: links.filter((l) => !l.linked).length,
    savedOnlyExtracts: savedOnly.length,
  };
}

/** Extracts with no inject reference anywhere (context-only). */
export function buildRuntimeSavedOnlyExtracts(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
): RuntimeSavedOnlyExtract[] {
  const catalog = buildRuntimeVariableCatalog(runSteps, bindings);
  const out: RuntimeSavedOnlyExtract[] = [];
  for (const entry of catalog) {
    if (entry.generatedAtStepIndex < 0) continue;
    if (entry.usedAtStepIndexes.length > 0) continue;
    const step = runSteps[entry.generatedAtStepIndex];
    out.push({
      var: entry.var,
      stepIndex: entry.generatedAtStepIndex,
      caseId: step ? runStepCaseIdLabel(step) : entry.var,
      responsePath: entry.responsePath,
    });
  }
  return out;
}

export type VariableFlowLane = {
  var: string;
  fromStepIndex: number;
  hops: Array<{ toStepIndex: number; linked: boolean }>;
};

/** One row per runtime variable for the flow strip (extract → inject hops). */
export function buildVariableFlowLanes(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
): VariableFlowLane[] {
  const byVar = new Map<string, VariableFlowLane>();

  const ensure = (varName: string, fromStep: number) => {
    const v = varName.trim();
    if (!v) return;
    const existing = byVar.get(v);
    if (existing) {
      if (fromStep >= 0 && (existing.fromStepIndex < 0 || fromStep < existing.fromStepIndex)) {
        existing.fromStepIndex = fromStep;
      }
      return;
    }
    byVar.set(v, { var: v, fromStepIndex: fromStep, hops: [] });
  };

  runSteps.forEach((step, stepIndex) => {
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    for (const ex of cfg.extracts) {
      ensure(ex.var, stepIndex);
    }
  });

  for (const link of buildRuntimeConnectionLinks(runSteps, bindings)) {
    ensure(link.var, link.linked ? link.fromStepIndex : -1);
    const lane = byVar.get(link.var.trim());
    if (!lane) continue;
    lane.hops.push({
      toStepIndex: link.toStepIndex,
      linked: link.linked,
    });
  }

  for (const s of buildRuntimeSavedOnlyExtracts(runSteps, bindings)) {
    ensure(s.var, s.stepIndex);
  }

  return [...byVar.values()].sort((a, b) => {
    const ai = a.fromStepIndex < 0 ? 999 : a.fromStepIndex;
    const bi = b.fromStepIndex < 0 ? 999 : b.fromStepIndex;
    if (ai !== bi) return ai - bi;
    return a.var.localeCompare(b.var);
  });
}

/** Matched extract→inject pairs (adjacent steps only; legacy summary). */
export function buildConnectedFlowLinks(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
): ConnectedFlowLink[] {
  const links: ConnectedFlowLink[] = [];
  for (let i = 1; i < runSteps.length; i++) {
    const fromStep = runSteps[i - 1];
    const toStep = runSteps[i];
    const prevCfg = bindings[fromStep.stepKey] ?? emptyStepBinding();
    const curCfg = bindings[toStep.stepKey] ?? emptyStepBinding();
    const extractByVar = new Map(
      prevCfg.extracts
        .filter((r) => r.var.trim())
        .map((r) => [r.var.trim(), stripBindingPathForInput(r.json_path)]),
    );
    for (const inj of curCfg.injects) {
      const v = inj.var.trim();
      if (!v) continue;
      const resp = extractByVar.get(v);
      if (!resp) continue;
      links.push({
        var: v,
        fromStepIndex: i - 1,
        toStepIndex: i,
        fromServiceCode: fromStep.serviceCode,
        toServiceCode: toStep.serviceCode,
        responsePath: resp,
        requestPath: stripBindingPathForInput(inj.json_path),
      });
    }
  }
  return links;
}

export function buildRecipeCards(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
): ScenarioRecipeCard[] {
  const cards: ScenarioRecipeCard[] = [];
  for (let i = 1; i < runSteps.length; i++) {
    const fromStep = runSteps[i - 1];
    const toStep = runSteps[i];
    const prevCfg = bindings[fromStep.stepKey] ?? emptyStepBinding();
    const curCfg = bindings[toStep.stepKey] ?? emptyStepBinding();
    const extractByVar = new Map(
      prevCfg.extracts
        .filter((r) => r.var.trim())
        .map((r) => [
          r.var.trim(),
          stripBindingPathForInput(r.json_path),
        ]),
    );
    const connections: ScenarioRecipeConnection[] = [];
    for (const inj of curCfg.injects) {
      const v = inj.var.trim();
      if (!v) continue;
      const resp = extractByVar.get(v);
      if (!resp) continue;
      connections.push({
        var: v,
        responsePath: resp,
        requestPath: stripBindingPathForInput(inj.json_path),
      });
    }
    cards.push({
      pairIndex: i - 1,
      fromStep,
      toStep,
      connections,
    });
  }
  return cards;
}

export function analyzeBindingReview(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
): { connectionCount: number; issueCount: number; issues: BindingReviewIssue[] } {
  const issues: BindingReviewIssue[] = [];
  let connectionCount = 0;

  const savedBefore = (stepIndex: number, varName: string): boolean => {
    for (let i = 0; i < stepIndex; i++) {
      const cfg = bindings[runSteps[i].stepKey] ?? emptyStepBinding();
      if (cfg.extracts.some((e) => e.var.trim() === varName)) return true;
    }
    return false;
  };

  runSteps.forEach((step, stepIndex) => {
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    const caseId = runStepCaseIdLabel(step);

    for (const inj of cfg.injects) {
      const v = inj.var.trim();
      if (!v) continue;
      connectionCount += 1;
      if (stepIndex > 0 && !savedBefore(stepIndex, v)) {
        issues.push({
          kind: "orphan_inject",
          var: v,
          stepIndex,
          caseId,
          message: `${caseId}에서 «${v}»를 쓰지만 이전 단계에 저장된 값이 없습니다.`,
        });
      }
    }

    for (const ex of cfg.extracts) {
      const v = ex.var.trim();
      if (!v) continue;
      const usedLater = runSteps
        .slice(stepIndex + 1)
        .some((s) =>
          (bindings[s.stepKey] ?? emptyStepBinding()).injects.some(
            (i) => i.var.trim() === v,
          ),
        );
      if (!usedLater && stepIndex < runSteps.length - 1) {
        issues.push({
          kind: "unused_extract",
          var: v,
          stepIndex,
          caseId,
          message: `${caseId}에서 «${v}»를 저장했지만 이후 단계에서 사용하지 않습니다.`,
        });
      }
    }
  });

  return { connectionCount, issueCount: issues.length, issues };
}

export function suggestionSourceLabel(
  source: "llm" | "heuristic" | "hybrid",
): string {
  if (source === "llm") return "AI";
  if (source === "hybrid") return "AI+규칙";
  return "자동";
}

export function linksToRecipeHints(
  links: SuggestedBindingLinkDto[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const link of links) {
    const pair = link.to_service_index - 1;
    if (pair < 0) continue;
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

/**
 * Schema-driven runtime context flow (no domain-specific variable naming).
 */
import type { SuggestedBindingLinkDto } from "@/api/types";
import { parseMaterializedTestcaseName } from "@/lib/materializedTestcaseName";
import {
  dedupeBindingRowsByVar,
  emptyStepBinding,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
  fieldVarNameFromPath,
  findExtractSource,
} from "@/lib/scenarioConnectionUx";
import {
  runStepCaseIdLabel,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";

export const RUNTIME_KEY_VARS_VISIBLE = 3;

export type RuntimeVarRef = {
  var: string;
  /** Part of an explicit user or suggested connection. */
  connected: boolean;
  link?: SuggestedBindingLinkDto;
};

export type RuntimeStepCard = {
  order: number;
  stepIndex: number;
  stepKey: string;
  serviceCode: string;
  caseId: string;
  title: string;
  /** Values written to runtime context after this step. */
  generated: RuntimeVarRef[];
  /** Values read from runtime context before this step. */
  consumed: RuntimeVarRef[];
};

export type RuntimeContextEntry = {
  var: string;
  valuePreview: string | null;
  writtenAtStepIndex: number | null;
  readAtStepIndexes: number[];
};

export type RuntimeFlowException = {
  stepIndex: number;
  stepTitle: string;
  var: string;
  message: string;
  recoveryLabel: string;
  recoveryPairIndex: number;
  recoveryFromStepIndex: number;
  recoveryVar: string;
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "스키마 일치 (높음)",
  medium: "이름 유사 (중간)",
  low: "추론 (낮음)",
};

export function stepDisplayTitle(step: ScenarioRunStep): string {
  const parsed = parseMaterializedTestcaseName(step.title, step.serviceCode);
  if (parsed.shortLabel?.trim()) return parsed.shortLabel.trim();
  const t = step.title?.trim();
  if (t && t.length <= 80) return t;
  return runStepCaseIdLabel(step);
}

export function stepCardLabel(step: Pick<RuntimeStepCard, "caseId" | "title" | "serviceCode">): string {
  const parts = [step.caseId, step.title].filter(Boolean);
  return parts.join(" · ") || step.caseId || step.serviceCode;
}

function linkKey(toIndex: number, varName: string): string {
  return `${toIndex}:${varName.trim()}`;
}

export function indexSuggestionLinks(
  links: SuggestedBindingLinkDto[],
): Map<string, SuggestedBindingLinkDto> {
  const map = new Map<string, SuggestedBindingLinkDto>();
  for (const link of links) {
    map.set(linkKey(link.to_service_index, link.var), link);
  }
  return map;
}

function hasExtractBefore(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  beforeStepIndex: number,
  varName: string,
): boolean {
  for (let j = 0; j < beforeStepIndex; j++) {
    const cfg = bindings[runSteps[j].stepKey] ?? emptyStepBinding();
    if (cfg.extracts.some((e) => e.var.trim() === varName)) return true;
  }
  return false;
}

function hasInjectAfter(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  afterStepIndex: number,
  varName: string,
): boolean {
  for (let j = afterStepIndex + 1; j < runSteps.length; j++) {
    const cfg = bindings[runSteps[j].stepKey] ?? emptyStepBinding();
    if (cfg.injects.some((i) => i.var.trim() === varName)) return true;
  }
  return false;
}

function isBindingLinked(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  stepIndex: number,
  varName: string,
  mode: "generated" | "consumed",
): boolean {
  if (mode === "generated") {
    return hasInjectAfter(runSteps, bindings, stepIndex, varName);
  }
  if (stepIndex === 0) return false;
  return hasExtractBefore(runSteps, bindings, stepIndex, varName);
}

export function buildRuntimeStepCards(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  suggestionLinks: SuggestedBindingLinkDto[] = [],
): RuntimeStepCard[] {
  const linkByInject = indexSuggestionLinks(suggestionLinks);

  return runSteps.map((step, stepIndex) => {
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    const extracts = dedupeBindingRowsByVar(cfg.extracts);
    const injects = dedupeBindingRowsByVar(cfg.injects);

    const generated: RuntimeVarRef[] = extracts
      .map((r) => r.var.trim())
      .filter(Boolean)
      .map((v) => ({
        var: v,
        connected: isBindingLinked(
          runSteps,
          bindings,
          stepIndex,
          v,
          "generated",
        ),
        link: suggestionLinks.find(
          (l) => l.from_service_index === stepIndex && l.var.trim() === v,
        ),
      }));

    const consumed: RuntimeVarRef[] = injects
      .map((r) => r.var.trim())
      .filter(Boolean)
      .map((v) => ({
        var: v,
        connected: isBindingLinked(
          runSteps,
          bindings,
          stepIndex,
          v,
          "consumed",
        ),
        link: linkByInject.get(linkKey(stepIndex, v)),
      }));

    return {
      order: step.order,
      stepIndex,
      stepKey: step.stepKey,
      serviceCode: step.serviceCode,
      caseId: runStepCaseIdLabel(step),
      title: stepDisplayTitle(step),
      generated,
      consumed,
    };
  });
}

export function buildRuntimeContextSnapshot(
  cards: RuntimeStepCard[],
  contextAfter?: Record<string, unknown> | null,
): RuntimeContextEntry[] {
  const byVar = new Map<string, RuntimeContextEntry>();

  for (const card of cards) {
    for (const g of card.generated) {
      const prev = byVar.get(g.var);
      const preview =
        contextAfter?.[g.var] != null
          ? formatContextValue(contextAfter[g.var])
          : null;
      byVar.set(g.var, {
        var: g.var,
        valuePreview: preview ?? prev?.valuePreview ?? null,
        writtenAtStepIndex: card.stepIndex,
        readAtStepIndexes: prev?.readAtStepIndexes ?? [],
      });
    }
    for (const c of card.consumed) {
      const prev = byVar.get(c.var) ?? {
        var: c.var,
        valuePreview: null,
        writtenAtStepIndex: null,
        readAtStepIndexes: [],
      };
      if (!prev.readAtStepIndexes.includes(card.stepIndex)) {
        prev.readAtStepIndexes.push(card.stepIndex);
      }
      if (contextAfter?.[c.var] != null) {
        prev.valuePreview = formatContextValue(contextAfter[c.var]);
      }
      byVar.set(c.var, prev);
    }
  }

  return [...byVar.values()].sort((a, b) => a.var.localeCompare(b.var));
}

export function formatContextValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") {
    return value.length > 40 ? `${value.slice(0, 40)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const s = JSON.stringify(value);
    return s.length > 48 ? `${s.slice(0, 48)}…` : s;
  } catch {
    return "…";
  }
}

export function linkReasonLines(link: SuggestedBindingLinkDto): string[] {
  const lines: string[] = [];
  if (link.reason?.trim()) lines.push(link.reason.trim());
  lines.push(CONFIDENCE_LABEL[link.confidence] ?? "휴리스틱");
  lines.push("응답 필드 → 요청 필드");
  return [...new Set(lines)];
}

/** Matched inject ↔ prior extract pairs (not raw inject row count). */
export function countPropagations(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
): number {
  let n = 0;
  for (let i = 1; i < runSteps.length; i++) {
    const cfg = bindings[runSteps[i].stepKey] ?? emptyStepBinding();
    const vars = new Set(
      dedupeBindingRowsByVar(cfg.injects)
        .map((r) => r.var.trim())
        .filter(Boolean),
    );
    for (const v of vars) {
      if (hasExtractBefore(runSteps, bindings, i, v)) n += 1;
    }
  }
  return n;
}

/** Whether an inject ``var`` is backed by a collection start var or a prior-step extract. */
export function isInjectVarResolvable(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  stepIndex: number,
  varName: string,
  startVarKeys: readonly string[] = [],
): boolean {
  const v = varName.trim();
  if (!v) return false;
  const startSet = new Set(startVarKeys.map((k) => k.trim()).filter(Boolean));
  if (startSet.has(v)) return true;
  return findExtractSource(runSteps, bindings, v, stepIndex) != null;
}

/** Drop inject rows that reference removed collection vars (no matching extract). */
export function pruneOrphanInjects(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  startVarKeys: readonly string[] = [],
): StepBindingsByStepKey {
  let next = bindings;
  let anyChanged = false;

  runSteps.forEach((step, stepIndex) => {
    const cfg = next[step.stepKey] ?? emptyStepBinding();
    const injects = cfg.injects.filter((inj) =>
      isInjectVarResolvable(runSteps, bindings, stepIndex, inj.var, startVarKeys),
    );
    if (injects.length === cfg.injects.length) return;
    anyChanged = true;
    next = { ...next, [step.stepKey]: { ...cfg, injects } };
  });

  return anyChanged ? next : bindings;
}

export function buildRuntimeFlowExceptions(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  startVarKeys: readonly string[] = [],
): RuntimeFlowException[] {
  const out: RuntimeFlowException[] = [];

  runSteps.forEach((step, stepIndex) => {
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    const stepTitle = `${runStepCaseIdLabel(step)} · ${stepDisplayTitle(step)}`;

    for (const inj of cfg.injects) {
      const v = inj.var.trim();
      if (!v) continue;
      if (
        isInjectVarResolvable(runSteps, bindings, stepIndex, v, startVarKeys)
      ) {
        continue;
      }

      if (stepIndex === 0) {
        out.push({
          stepIndex,
          stepTitle,
          var: v,
          message: `«${v}»는 컬렉션 변수에 없습니다. 아래에서 선언하거나 앞 단계 extract가 필요합니다.`,
          recoveryLabel: "컬렉션 변수 추가",
          recoveryPairIndex: 0,
          recoveryFromStepIndex: 0,
          recoveryVar: v,
        });
        continue;
      }

      let recoveryFrom = -1;
      for (let j = stepIndex - 1; j >= 0; j--) {
        const prev = bindings[runSteps[j].stepKey] ?? emptyStepBinding();
        if (recoveryFrom < 0 && prev.extracts.length > 0) {
          recoveryFrom = j;
        }
      }

      const recoveryStep =
        recoveryFrom >= 0 ? runSteps[recoveryFrom] : runSteps[stepIndex - 1];
      const recoveryCfg =
        bindings[recoveryStep.stepKey] ?? emptyStepBinding();
      const candidate =
        recoveryCfg.extracts.find((e) => e.var.trim() === v) ??
        recoveryCfg.extracts[0];
      const recoveryVar = candidate?.var.trim() ?? v;

      out.push({
        stepIndex,
        stepTitle,
        var: v,
        message: `이 단계에 런타임 변수 «${v}»가 필요하지만 이전 단계에서 제공되지 않습니다.`,
        recoveryLabel: `${runStepCaseIdLabel(recoveryStep)} 단계의 «${recoveryVar}» 사용`,
        recoveryPairIndex: stepIndex - 1,
        recoveryFromStepIndex:
          recoveryFrom >= 0 ? recoveryFrom : stepIndex - 1,
        recoveryVar,
      });
    }
  });

  return out;
}

/** Schema-agnostic: highlight request paths compatible with staged response field. */
export function partitionCompatibleRequestPaths(
  responsePath: string,
  requestPaths: string[],
): { compatible: string[]; other: string[] } {
  const leaf = fieldVarNameFromPath(responsePath).toLowerCase();
  if (!leaf) return { compatible: [], other: requestPaths };
  const compatible = requestPaths.filter((p) => {
    const reqLeaf = fieldVarNameFromPath(p).toLowerCase();
    return (
      reqLeaf === leaf ||
      reqLeaf.endsWith(`.${leaf}`) ||
      leaf.endsWith(`.${reqLeaf}`) ||
      reqLeaf.includes(leaf) ||
      leaf.includes(reqLeaf)
    );
  });
  const set = new Set(compatible);
  return { compatible, other: requestPaths.filter((p) => !set.has(p)) };
}

export function pickBestRequestPathForVar(
  responsePath: string,
  varName: string,
  requestPaths: string[],
): string {
  const { compatible } = partitionCompatibleRequestPaths(responsePath, requestPaths);
  if (compatible.length === 1) return compatible[0];
  if (compatible.length > 1) {
    const exact = compatible.find(
      (p) => fieldVarNameFromPath(p).toLowerCase() === varName.toLowerCase(),
    );
    return exact ?? compatible[0];
  }
  if (requestPaths.includes(responsePath)) return responsePath;
  const byVar = requestPaths.filter(
    (p) => fieldVarNameFromPath(p).toLowerCase() === varName.toLowerCase(),
  );
  if (byVar.length === 1) return byVar[0];
  return responsePath;
}

export function previewValueForVar(
  varName: string,
  contextAfter?: Record<string, unknown> | null,
  stepOrder = 1,
): string {
  if (contextAfter?.[varName] != null) {
    return formatContextValue(contextAfter[varName]);
  }
  const seed = `${varName}-${stepOrder}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `"sample_${Math.abs(h % 10000)}"`;
}

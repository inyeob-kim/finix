import type { SuggestedBindingLinkDto } from "@/api/types";
import { parseMaterializedTestcaseName } from "@/lib/materializedTestcaseName";
import {
  emptyStepBinding,
  stripBindingPathForInput,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
  runStepCaseIdLabel,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";

/** Default visible vars per group before "더 보기". */
export const FLOW_KEY_VARS_VISIBLE = 3;

export type FlowValueRef = {
  var: string;
  auto: boolean;
  isKey: boolean;
  link?: SuggestedBindingLinkDto;
};

export type FlowStepNarrative = {
  order: number;
  stepIndex: number;
  caseId: string;
  displayName: string;
  subLabel?: string;
  saved: FlowValueRef[];
  usedFromPrior: Array<FlowValueRef & { fromStepCode?: string }>;
};

export type FlowSummarySegment = {
  kind: "step" | "bridge";
  step?: FlowStepNarrative;
  /** e.g. "arrIdNbr 생성" or "arrIdNbr 사용" */
  line?: string;
  vars?: string[];
};

export type FlowException = {
  stepIndex: number;
  displayName: string;
  var: string;
  varLabel: string;
  message: string;
  recoveryLabel: string;
  recoveryPairIndex: number;
  recoveryFromStepIndex: number;
  recoveryVar: string;
};

const CONFIDENCE_SCORE: Record<string, string> = {
  high: "이름·의미 일치 (높음)",
  medium: "이름 유사 (보통)",
  low: "추정 연결 (낮음)",
};

export function businessStepDisplayName(step: ScenarioRunStep): string {
  const parsed = parseMaterializedTestcaseName(step.title, step.serviceCode);
  if (parsed.shortLabel?.trim()) return parsed.shortLabel.trim();
  const raw = step.title?.trim() || "";
  const stripped = raw
    .replace(/^\[(E|N)\]\s*\S+\s*·?\s*/i, "")
    .replace(/^[A-Z]{2,}\d{2,}[-_]\S*\s*/i, "")
    .trim();
  if (stripped.length >= 2 && stripped.length <= 48) return stripped;
  return step.serviceName?.trim() || step.serviceCode;
}

export function businessLabelForVar(
  varName: string,
  ctx?: { fromStep?: ScenarioRunStep; toStep?: ScenarioRunStep },
): string {
  const v = varName.trim();
  if (!v) return "값";

  const fromName = ctx?.fromStep
    ? businessStepDisplayName(ctx.fromStep)
    : "이전 단계";

  if (/arr(angement)?id/i.test(v) || /arrid/i.test(v)) {
    return `${fromName}에서 생성된 계좌`;
  }
  if (/cust/i.test(v)) return "고객 정보";
  if (/trns|transaction/i.test(v)) return "거래 번호";
  if (/status|stat/i.test(v)) return "상태 정보";
  if (/token/i.test(v)) return "인증 토큰";
  if (/acct|account/i.test(v)) return "계좌 정보";
  if (/id$/i.test(v) || /idnbr/i.test(v) || /nbr$/i.test(v)) {
    return `${fromName}에서 받은 식별자`;
  }

  const words = v
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return words.slice(0, 3).join(" ");
  }
  return v;
}

export function linkReasonLines(link: SuggestedBindingLinkDto): string[] {
  const lines: string[] = [];
  if (link.reason?.trim()) lines.push(link.reason.trim());
  lines.push(CONFIDENCE_SCORE[link.confidence] ?? "자동 규칙");
  lines.push("이전 단계 응답에서 값을 가져옴");
  lines.push("다음 단계 요청에 자동 반영");
  return [...new Set(lines)];
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

/** Card title: ``PY023`` + short scenario name. */
export function stepCardHeading(step: ScenarioRunStep): string {
  const caseId = runStepCaseIdLabel(step);
  const name = businessStepDisplayName(step);
  if (caseId && name && name !== caseId) return `${caseId} ${name}`;
  return caseId || name;
}

function markKeyVars(
  vars: string[],
  stepIndex: number,
  suggestionLinks: SuggestedBindingLinkDto[],
): Set<string> {
  const key = new Set<string>();
  for (const v of vars) {
    const linked = suggestionLinks.some(
      (l) =>
        l.var.trim() === v &&
        (l.from_service_index === stepIndex ||
          l.to_service_index === stepIndex),
    );
    if (linked) key.add(v);
  }
  if (key.size === 0 && vars.length > 0) {
    vars.slice(0, FLOW_KEY_VARS_VISIBLE).forEach((v) => key.add(v));
  }
  return key;
}

export function countCoreLinks(
  steps: FlowStepNarrative[],
): { total: number; auto: number } {
  let total = 0;
  let auto = 0;
  for (const s of steps) {
    for (const u of s.usedFromPrior) {
      total += 1;
      if (u.auto) auto += 1;
    }
  }
  return { total, auto };
}

/** One-line flow for quick scan (no per-var repetition). */
export function buildFlowSummarySegments(
  steps: FlowStepNarrative[],
): FlowSummarySegment[] {
  const out: FlowSummarySegment[] = [];
  steps.forEach((step, idx) => {
    out.push({ kind: "step", step });
    if (idx < steps.length - 1) {
      const next = steps[idx + 1];
      const bridgeVars = next.usedFromPrior.map((u) => u.var);
      if (bridgeVars.length === 0) {
        out.push({ kind: "bridge", line: "자동 연결 없음" });
      } else if (bridgeVars.length === 1) {
        out.push({
          kind: "bridge",
          line: `${bridgeVars[0]} 사용`,
          vars: bridgeVars,
        });
      } else {
        out.push({
          kind: "bridge",
          line: `${bridgeVars.slice(0, 2).join(", ")} 등 ${bridgeVars.length}개 사용`,
          vars: bridgeVars,
        });
      }
    }
  });
  return out;
}

export function buildExecutionFlowNarrative(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  suggestionLinks: SuggestedBindingLinkDto[] = [],
): FlowStepNarrative[] {
  const linkByInject = indexSuggestionLinks(suggestionLinks);

  return runSteps.map((step, stepIndex) => {
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    const displayName = businessStepDisplayName(step);

    const savedVars = cfg.extracts
      .map((r) => r.var.trim())
      .filter(Boolean);
    const savedKeys = markKeyVars(savedVars, stepIndex, suggestionLinks);
    const saved: FlowValueRef[] = savedVars.map((v) => ({
      var: v,
      auto: suggestionLinks.some(
        (l) => l.from_service_index === stepIndex && l.var.trim() === v,
      ),
      isKey: savedKeys.has(v),
    }));

    const usedFromPrior: FlowStepNarrative["usedFromPrior"] = [];
    const usedVars: string[] = [];
    for (const inj of cfg.injects) {
      const v = inj.var.trim();
      if (!v) continue;
      usedVars.push(v);
    }
    const usedKeys = markKeyVars(usedVars, stepIndex, suggestionLinks);
    for (const inj of cfg.injects) {
      const v = inj.var.trim();
      if (!v) continue;
      let fromStep: ScenarioRunStep | undefined;
      for (let j = stepIndex - 1; j >= 0; j--) {
        const prev = bindings[runSteps[j].stepKey] ?? emptyStepBinding();
        if (prev.extracts.some((e) => e.var.trim() === v)) {
          fromStep = runSteps[j];
          break;
        }
      }
      const link = linkByInject.get(linkKey(stepIndex, v));
      usedFromPrior.push({
        var: v,
        auto: Boolean(link),
        isKey: usedKeys.has(v),
        link,
        fromStepCode: fromStep ? runStepCaseIdLabel(fromStep) : undefined,
      });
    }

    return {
      order: step.order,
      stepIndex,
      caseId: runStepCaseIdLabel(step),
      displayName,
      subLabel: step.serviceCode,
      saved,
      usedFromPrior,
    };
  });
}

export function buildFlowExceptions(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
): FlowException[] {
  const out: FlowException[] = [];

  runSteps.forEach((step, stepIndex) => {
    if (stepIndex === 0) return;
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    const displayName = businessStepDisplayName(step);

    for (const inj of cfg.injects) {
      const v = inj.var.trim();
      if (!v) continue;
      let found = false;
      let recoveryFrom = -1;
      for (let j = stepIndex - 1; j >= 0; j--) {
        const prev = bindings[runSteps[j].stepKey] ?? emptyStepBinding();
        if (prev.extracts.some((e) => e.var.trim() === v)) {
          found = true;
          break;
        }
        if (recoveryFrom < 0 && prev.extracts.length > 0) {
          recoveryFrom = j;
        }
      }
      if (found) continue;

      const recoveryStep =
        recoveryFrom >= 0 ? runSteps[recoveryFrom] : runSteps[stepIndex - 1];
      const recoveryCfg =
        bindings[recoveryStep.stepKey] ?? emptyStepBinding();
      const candidate =
        recoveryCfg.extracts.find((e) => e.var.trim() === v) ??
        recoveryCfg.extracts[0];
      const recoveryVar = candidate?.var.trim() ?? v;
      const fromName = businessStepDisplayName(recoveryStep);

      out.push({
        stepIndex,
        displayName,
        var: v,
        varLabel: v,
        message: `${stepCardHeading(step)}에 ${v}이(가) 필요하지만 이전 단계에서 연결되지 않았습니다.`,
        recoveryLabel: `${runStepCaseIdLabel(recoveryStep)} 응답의 ${recoveryVar} 사용`,
        recoveryPairIndex: stepIndex - 1,
        recoveryFromStepIndex:
          recoveryFrom >= 0 ? recoveryFrom : stepIndex - 1,
        recoveryVar,
      });
    }
  });

  return out;
}

/** Mock display when resolve API has no simulated body yet. */
export function mockDisplayValue(varName: string, stepOrder: number): string {
  const seed = `${varName}-${stepOrder}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const num = Math.abs(h % 900000) + 100000;
  if (/id|nbr|no/i.test(varName)) return `"A${num}"`;
  if (/status/i.test(varName)) return `"COMPLETED"`;
  return `"···"`;
}

export function extractMockFromBody(
  body: Record<string, unknown> | null | undefined,
  varName: string,
): string | null {
  if (!body || typeof body !== "object") return null;
  const target = varName.split(".").pop()?.toLowerCase() ?? varName.toLowerCase();

  const walk = (obj: unknown, depth: number): unknown => {
    if (depth > 5 || obj === null || obj === undefined) return undefined;
    if (typeof obj !== "object") return undefined;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const hit = walk(item, depth + 1);
        if (hit !== undefined) return hit;
      }
      return undefined;
    }
    const rec = obj as Record<string, unknown>;
    for (const [k, val] of Object.entries(rec)) {
      if (k.toLowerCase() === target || k.toLowerCase().includes(target)) {
        if (val !== null && val !== undefined && typeof val !== "object") {
          return val;
        }
      }
    }
    for (const val of Object.values(rec)) {
      const hit = walk(val, depth + 1);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };

  const v = walk(body, 0);
  if (v === undefined) return null;
  if (typeof v === "string") return `"${v.slice(0, 32)}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export function formatInjectWarningBusiness(
  warning: string,
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
): { message: string; recoveryLabel?: string; pairIndex?: number } {
  const missing = warning.match(/missing|required|need|없|필요/i);
  const varMatch = warning.match(/[A-Za-z][A-Za-z0-9_]{2,}/);
  const varName = varMatch?.[0] ?? "";
  const stepName =
    runSteps.length > 1
      ? businessStepDisplayName(runSteps[runSteps.length - 1])
      : "다음 단계";

  if (missing && varName) {
    for (let i = runSteps.length - 1; i > 0; i--) {
      const prev = bindings[runSteps[i - 1].stepKey] ?? emptyStepBinding();
      const hit = prev.extracts.find(
        (e) =>
          e.var.trim() === varName ||
          e.var.toLowerCase().includes(varName.toLowerCase()),
      );
      if (hit) {
        return {
          message: `${stepName}에 ${varName}이(가) 필요합니다.`,
          recoveryLabel: `${runStepCaseIdLabel(runSteps[i - 1])} 응답의 ${hit.var} 사용`,
          pairIndex: i - 1,
        };
      }
    }
  }

  return { message: warning };
}

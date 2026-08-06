import { parseMaterializedTestcaseName } from "@/lib/materializedTestcaseName";
import type { ScenarioRuleTestcaseRef } from "@/app/components/scenarioRegistry/types";

export type PoolCaseLiveStatus =
  | "ok"
  | "missing"
  | "empty"
  | "changed"
  | "no_case_id";

export type PoolCaseLiveHealth = {
  status: PoolCaseLiveStatus;
  message: string;
  liveFingerprint?: string;
  caseId?: string;
};

/** Stable fingerprint of a request body for change detection. */
export function fingerprintRequestBody(body: unknown): string {
  try {
    return `v1:${stableStringify(body ?? {})}`;
  } catch {
    return `v1:${String(body)}`;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

const EMPTY_BODY_FP = fingerprintRequestBody({});

export function poolCaseLiveMessage(status: PoolCaseLiveStatus): string {
  switch (status) {
    case "missing":
      return "원본 테스트케이스가 없습니다. Rules에서 다시 생성하세요.";
    case "empty":
      return "원본 Input이 비어 있습니다. YAML을 채운 뒤 풀을 다시 생성하세요.";
    case "changed":
      return "원본이 변경되었습니다. 확인 후 다시 실행할 수 있습니다.";
    case "no_case_id":
      return "case_id를 확인할 수 없습니다. 풀 테스트케이스를 다시 선택하세요.";
    default:
      return "";
  }
}

function findLivePoolRow(
  pick: ScenarioRuleTestcaseRef,
  poolRows: ScenarioRuleTestcaseRef[],
): ScenarioRuleTestcaseRef | undefined {
  const caseId = pick.ruleId?.trim();
  if (!caseId) return undefined;
  return poolRows.find((row) => {
    if (row.serviceCode !== pick.serviceCode) return false;
    const rowCase =
      row.ruleId?.trim() ||
      parseMaterializedTestcaseName(row.title, pick.serviceCode).ruleId;
    return rowCase === caseId;
  });
}

export function evaluatePickLiveHealth(
  pick: ScenarioRuleTestcaseRef,
  poolRows: ScenarioRuleTestcaseRef[],
): PoolCaseLiveHealth {
  const caseId = pick.ruleId?.trim();
  if (!caseId) {
    return {
      status: "no_case_id",
      message: poolCaseLiveMessage("no_case_id"),
    };
  }
  const live = findLivePoolRow(pick, poolRows);
  if (!live) {
    return {
      status: "missing",
      message: poolCaseLiveMessage("missing"),
      caseId,
    };
  }
  const fingerprint = live.pinnedFingerprint;
  if (!fingerprint) {
    return {
      status: "ok",
      message: "",
      caseId,
    };
  }
  if (fingerprint === EMPTY_BODY_FP) {
    return {
      status: "empty",
      message: poolCaseLiveMessage("empty"),
      liveFingerprint: fingerprint,
      caseId,
    };
  }
  const pinned = pick.pinnedFingerprint?.trim();
  if (pinned && pinned !== fingerprint) {
    return {
      status: "changed",
      message: poolCaseLiveMessage("changed"),
      liveFingerprint: fingerprint,
      caseId,
    };
  }
  return {
    status: "ok",
    message: "",
    liveFingerprint: fingerprint,
    caseId,
  };
}

/** Rebind pick refs to current pool twins; refresh title from pool. */
export function rebindPicksToLivePool(
  picks: ScenarioRuleTestcaseRef[],
  poolRows: ScenarioRuleTestcaseRef[],
): ScenarioRuleTestcaseRef[] {
  return picks.map((pick) => {
    const live = findLivePoolRow(pick, poolRows);
    if (!live) return pick;
    return {
      ...pick,
      title: live.title,
      description: live.description ?? pick.description,
      ruleType: live.ruleType ?? pick.ruleType,
      ruleId: live.ruleId ?? pick.ruleId,
    };
  });
}

/** First open: pin current live body so later rematerialize can detect changes. */
export function hydratePickFingerprints(
  picks: ScenarioRuleTestcaseRef[],
  poolRows: ScenarioRuleTestcaseRef[],
): ScenarioRuleTestcaseRef[] {
  return picks.map((pick) => {
    if (pick.pinnedFingerprint) return pick;
    const live = findLivePoolRow(pick, poolRows);
    if (!live?.pinnedFingerprint) return pick;
    if (live.pinnedFingerprint === EMPTY_BODY_FP) return pick;
    return { ...pick, pinnedFingerprint: live.pinnedFingerprint };
  });
}

export function acknowledgePickFingerprint(
  pick: ScenarioRuleTestcaseRef,
  poolRows: ScenarioRuleTestcaseRef[],
): ScenarioRuleTestcaseRef {
  const health = evaluatePickLiveHealth(pick, poolRows);
  if (!health.liveFingerprint || health.status === "missing") {
    return pick;
  }
  if (health.status === "empty") {
    return pick;
  }
  return {
    ...pick,
    pinnedFingerprint: health.liveFingerprint,
  };
}

export function anyPickBlocksRun(
  picks: ScenarioRuleTestcaseRef[],
  poolRows: ScenarioRuleTestcaseRef[],
): string | null {
  for (const pick of picks) {
    const health = evaluatePickLiveHealth(pick, poolRows);
    if (health.status !== "ok") {
      const label = pick.ruleId ?? pick.title;
      return `${label}: ${health.message}`;
    }
  }
  return null;
}

export function isBlockingLiveStatus(status: PoolCaseLiveStatus): boolean {
  return status !== "ok";
}

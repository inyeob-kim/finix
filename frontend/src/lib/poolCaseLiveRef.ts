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
  /** Scenario-pinned fnx_testcase_hist.version. */
  pinnedVersion?: number;
  /** Current pool latest hist version (when found). */
  liveVersion?: number;
};

export type TcPinBadgeTone =
  | "success"
  | "warning"
  | "danger"
  | "muted"
  | "info";

export type TcPinBadge = {
  label: string;
  tone: TcPinBadgeTone;
  title?: string;
};

/** Detail / table cell: `v3` or `v3 (최신 v5)` or `미핀`. */
export function formatPinnedVersionLine(
  pinned: number | undefined | null,
  live?: number | undefined | null,
): string {
  if (pinned == null || pinned <= 0) return "미핀";
  if (live != null && live > 0 && live !== pinned) {
    return `v${pinned} (최신 v${live})`;
  }
  return `v${pinned}`;
}

/** Flow / wizard card meta: `현재 vN` wording (or legacy unpinned). */
export function formatPinFlowLabel(pinned: number | undefined | null): string {
  if (pinned == null || pinned <= 0) return "미핀 · 실행 시 라이브 풀";
  return `현재 v${pinned}`;
}

/** Pool candidate row: latest hist when known. */
export function formatPoolLatestLabel(
  live: number | undefined | null,
): string | null {
  if (live == null || live <= 0) return null;
  return `최신 v${live}`;
}

/**
 * Status badge for selected picks.
 * Drift (`changed`) has no badge — hint goes on a tooltip instead.
 */
export function resolveTcPinBadge(
  pick: ScenarioRuleTestcaseRef,
  health?: PoolCaseLiveHealth,
): TcPinBadge | null {
  const pinned = pick.tcHistVersion;
  if (health?.status === "missing") {
    return {
      label: "풀에서 삭제됨",
      tone: "danger",
      title: health.message,
    };
  }
  if (health?.status === "empty" || health?.status === "no_case_id") {
    return {
      label: "확인 필요",
      tone: "danger",
      title: health.message,
    };
  }
  if (health?.status === "changed") {
    return null;
  }
  if (pinned == null || pinned <= 0) {
    return {
      label: "미핀",
      tone: "muted",
      title: "미핀 · 실행 시 라이브 풀",
    };
  }
  return {
    label: "고정",
    tone: "success",
    title: "실행 시 이 버전 스냅샷을 사용합니다.",
  };
}

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
      return "원본 테스트케이스가 풀에서 삭제되었습니다. Rules에서 다시 생성하세요.";
    case "empty":
      return "원본 Input이 비어 있습니다. YAML을 채운 뒤 풀을 다시 생성하세요.";
    case "changed":
      return "원본 풀이 최신화되었습니다. 시나리오는 기존 버전을 유지합니다. 최신으로 갱신하려면 버튼을 누르세요.";
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
  const pinnedVersion =
    pick.tcHistVersion != null && pick.tcHistVersion > 0
      ? pick.tcHistVersion
      : undefined;
  if (!caseId) {
    return {
      status: "no_case_id",
      message: poolCaseLiveMessage("no_case_id"),
      pinnedVersion,
    };
  }
  const live = findLivePoolRow(pick, poolRows);
  const liveVersion =
    live?.tcHistVersion != null && live.tcHistVersion > 0
      ? live.tcHistVersion
      : undefined;
  if (!live) {
    return {
      status: "missing",
      message: poolCaseLiveMessage("missing"),
      caseId,
      pinnedVersion,
    };
  }
  const fingerprint = live.pinnedFingerprint;
  if (!fingerprint) {
    return {
      status: "ok",
      message: "",
      caseId,
      pinnedVersion,
      liveVersion,
    };
  }
  if (fingerprint === EMPTY_BODY_FP) {
    return {
      status: "empty",
      message: poolCaseLiveMessage("empty"),
      liveFingerprint: fingerprint,
      caseId,
      pinnedVersion,
      liveVersion,
    };
  }
  const pinned = pick.pinnedFingerprint?.trim();
  const versionChanged =
    pinnedVersion != null &&
    liveVersion != null &&
    pinnedVersion !== liveVersion;
  if ((pinned && pinned !== fingerprint) || versionChanged) {
    return {
      status: "changed",
      message: poolCaseLiveMessage("changed"),
      liveFingerprint: fingerprint,
      caseId,
      pinnedVersion,
      liveVersion,
    };
  }
  return {
    status: "ok",
    message: "",
    liveFingerprint: fingerprint,
    caseId,
    pinnedVersion,
    liveVersion,
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

/**
 * Pin missing hist versions (and fingerprints) from the live pool.
 * Used on wizard open and again on save so legacy unpinned steps normalize
 * to the same “attach pins latest” behavior as the backend.
 */
export function hydratePickFingerprints(
  picks: ScenarioRuleTestcaseRef[],
  poolRows: ScenarioRuleTestcaseRef[],
): ScenarioRuleTestcaseRef[] {
  return picks.map((pick) => {
    const live = findLivePoolRow(pick, poolRows);
    let next = pick;
    if (!pick.pinnedFingerprint) {
      if (
        live?.pinnedFingerprint &&
        live.pinnedFingerprint !== EMPTY_BODY_FP
      ) {
        next = { ...next, pinnedFingerprint: live.pinnedFingerprint };
      }
    }
    if (
      (next.tcHistVersion == null || next.tcHistVersion <= 0) &&
      live?.tcHistVersion != null &&
      live.tcHistVersion > 0
    ) {
      next = { ...next, tcHistVersion: live.tcHistVersion };
    }
    return next;
  });
}

/** Alias: save-time normalization of legacy unpinned scenario steps. */
export const normalizeLegacyPinsToLatest = hydratePickFingerprints;

/** Explicitly bump the scenario pin to the current live pool version. */
export function acknowledgePickFingerprint(
  pick: ScenarioRuleTestcaseRef,
  poolRows: ScenarioRuleTestcaseRef[],
): ScenarioRuleTestcaseRef {
  const health = evaluatePickLiveHealth(pick, poolRows);
  if (health.status === "missing" || health.status === "empty") {
    return pick;
  }
  const live = findLivePoolRow(pick, poolRows);
  if (!live) return pick;
  return applyLivePoolRowToPick(pick, live);
}

/** Apply a freshly fetched pool row (or twin) onto a scenario pick. */
export function applyLivePoolRowToPick(
  pick: ScenarioRuleTestcaseRef,
  live: ScenarioRuleTestcaseRef,
): ScenarioRuleTestcaseRef {
  const nextFingerprint = live.pinnedFingerprint ?? pick.pinnedFingerprint;
  const liveVersion =
    live.tcHistVersion != null && live.tcHistVersion > 0
      ? live.tcHistVersion
      : undefined;
  return {
    ...pick,
    pinnedFingerprint: nextFingerprint,
    tcHistVersion: liveVersion ?? pick.tcHistVersion,
    title: live.title,
    description: live.description ?? pick.description,
    ruleType: live.ruleType ?? pick.ruleType,
    requestBody: live.requestBody ?? pick.requestBody,
  };
}

export function anyPickBlocksRun(
  picks: ScenarioRuleTestcaseRef[],
  poolRows: ScenarioRuleTestcaseRef[],
): string | null {
  for (const pick of picks) {
    const health = evaluatePickLiveHealth(pick, poolRows);
    // "changed" is a soft warning — pinned hist still runs until user refreshes.
    if (health.status !== "ok" && health.status !== "changed") {
      const label = pick.ruleId ?? pick.title;
      return `${label}: ${health.message}`;
    }
  }
  return null;
}

export function isBlockingLiveStatus(status: PoolCaseLiveStatus): boolean {
  return status !== "ok" && status !== "changed";
}

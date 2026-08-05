/** Resume YAML rules edit modal after navigating away (e.g. execution detail). */

export type RulesMetaResumeState = {
  serviceCode: string;
  bundleId: number;
  activeTab: "yaml" | "testcases";
  savedAt: number;
};

const STORAGE_KEY = "finix.rulesMeta.resume.v1";
const MAX_AGE_MS = 30 * 60 * 1000;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function isValidResume(raw: unknown): raw is RulesMetaResumeState {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.serviceCode === "string" &&
    o.serviceCode.trim().length > 0 &&
    typeof o.bundleId === "number" &&
    Number.isFinite(o.bundleId) &&
    (o.activeTab === "yaml" || o.activeTab === "testcases") &&
    typeof o.savedAt === "number"
  );
}

export function saveRulesMetaResume(
  state: Omit<RulesMetaResumeState, "savedAt">,
): void {
  if (!isBrowser()) return;
  try {
    const payload: RulesMetaResumeState = {
      ...state,
      serviceCode: state.serviceCode.trim(),
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota / private mode.
  }
}

export function peekRulesMetaResume(): RulesMetaResumeState | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidResume(parsed)) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearRulesMetaResume();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Read and clear. Returns null if missing/expired/invalid. */
export function takeRulesMetaResume(): RulesMetaResumeState | null {
  const next = peekRulesMetaResume();
  clearRulesMetaResume();
  return next;
}

export function clearRulesMetaResume(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

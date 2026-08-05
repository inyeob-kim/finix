import { REGISTRY_UI_SESSION_KEY } from "./constants";

export type RegistryUiSession = {
  selectedFolderId: string | null;
  selectedScenarioId: string | null;
  query: string;
  tagFilter: string;
  previewCollapsed: boolean;
  savedAt: number;
};

const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function isValidSession(raw: unknown): raw is RegistryUiSession {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    (o.selectedFolderId === null || typeof o.selectedFolderId === "string") &&
    (o.selectedScenarioId === null || typeof o.selectedScenarioId === "string") &&
    typeof o.query === "string" &&
    typeof o.tagFilter === "string" &&
    typeof o.previewCollapsed === "boolean" &&
    typeof o.savedAt === "number"
  );
}

export function saveRegistryUiSession(
  state: Omit<RegistryUiSession, "savedAt">,
): void {
  if (!isBrowser()) return;
  try {
    const payload: RegistryUiSession = {
      ...state,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(REGISTRY_UI_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function loadRegistryUiSession(): RegistryUiSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(REGISTRY_UI_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSession(parsed)) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearRegistryUiSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearRegistryUiSession(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(REGISTRY_UI_SESSION_KEY);
  } catch {
    // ignore
  }
}

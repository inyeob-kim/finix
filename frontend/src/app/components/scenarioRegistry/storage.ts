import { STORAGE_KEY_V1, STORAGE_KEY_V2 } from "./constants";
import { firstFolderIdInDisplayOrder } from "./folderModel";
import type {
  ScenarioRegistryFolder,
  ScenarioRegistryItem,
  ScenarioRegistryStateV2,
  ScenarioSaveStatus,
  ServiceCatalogItem,
} from "./types";
import { defaultRegistryV2, nowStamp, safeJsonParse, newId } from "./utils";

function ensureServiceSequence(x: unknown): ServiceCatalogItem[] {
  const seq = (x as { serviceSequence?: ServiceCatalogItem[] } | null)
    ?.serviceSequence;
  if (Array.isArray(seq) && seq.length > 0) return seq;
  const sc = (x as { serviceCode?: string } | null)?.serviceCode ?? "";
  const sn = (x as { serviceName?: string } | null)?.serviceName ?? "";
  return sc ? [{ code: sc, name: sn || sc }] : [];
}

export type LoadedRegistryState = {
  folders: ScenarioRegistryFolder[];
  scenarios: ScenarioRegistryItem[];
  selectedFolderId: string | null;
  /** true if state came from any storage/seed path */
  hydrated: boolean;
};

function normalizeSaveStatus(raw: unknown): ScenarioSaveStatus | undefined {
  if (raw === "draft") return "draft";
  if (raw === "ready") return "ready";
  return undefined;
}

function normalizeWizardStep(raw: unknown): 1 | 2 | 3 | undefined {
  if (raw === 1 || raw === 2 || raw === 3) return raw;
  return undefined;
}

/** Drop unknown legacy fields; keep saveStatus / wizardStep when valid. */
export function normalizeScenarioItem(
  item: ScenarioRegistryItem & Record<string, unknown>,
): ScenarioRegistryItem {
  const {
    status: _legacyStatus,
    saveStatus: rawSaveStatus,
    wizardStep: rawWizardStep,
    ...rest
  } = item;
  void _legacyStatus;
  const saveStatus = normalizeSaveStatus(rawSaveStatus);
  const wizardStep = normalizeWizardStep(rawWizardStep);
  return {
    ...(rest as ScenarioRegistryItem),
    ...(saveStatus ? { saveStatus } : {}),
    ...(wizardStep ? { wizardStep } : {}),
  };
}

export function loadRegistryState(updatedBy: string): LoadedRegistryState {
  const v2 = safeJsonParse<ScenarioRegistryStateV2>(
    localStorage.getItem(STORAGE_KEY_V2),
  );
  if (v2?.version === 2) {
    const folders = v2.folders ?? [];
    const scenarios = (v2.scenarios ?? []).map((x) => {
      const seq = ensureServiceSequence(x);
      const base =
        Array.isArray((x as ScenarioRegistryItem).serviceSequence) &&
        (x as ScenarioRegistryItem).serviceSequence.length > 0
          ? (x as ScenarioRegistryItem)
          : ({
              ...(x as unknown as object),
              serviceSequence: seq,
            } as ScenarioRegistryItem);
      return normalizeScenarioItem(
        base as ScenarioRegistryItem & Record<string, unknown>,
      );
    });
    const folderIds = new Set(folders.map((f) => f.id));
    const savedFolderId =
      typeof v2.selectedFolderId === "string" ? v2.selectedFolderId : null;
    const selectedFolderId =
      savedFolderId && folderIds.has(savedFolderId)
        ? savedFolderId
        : firstFolderIdInDisplayOrder(folders);
    return {
      folders,
      scenarios,
      selectedFolderId,
      hydrated: true,
    };
  }

  const v1 = safeJsonParse<ScenarioRegistryItem[]>(
    localStorage.getItem(STORAGE_KEY_V1),
  );

  const seed = defaultRegistryV2(updatedBy);
  if (v1?.length) {
    const base = nowStamp();
    const migratedRoot: ScenarioRegistryFolder = {
      id: newId(),
      name: "Migrated",
      parentId: null,
      createdAt: base,
      updatedAt: base,
      updatedBy,
    };
    const migrated: ScenarioRegistryStateV2 = {
      version: 2,
      folders: [migratedRoot],
      scenarios: v1.map((x) =>
        normalizeScenarioItem({
          ...x,
          folderId: migratedRoot.id,
          serviceSequence: ensureServiceSequence(x),
        } as ScenarioRegistryItem & Record<string, unknown>),
      ),
    };
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(migrated));
    return {
      folders: migrated.folders,
      scenarios: migrated.scenarios,
      selectedFolderId: migratedRoot.id,
      hydrated: true,
    };
  }

  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seed));
  return {
    folders: seed.folders,
    scenarios: seed.scenarios,
    selectedFolderId: firstFolderIdInDisplayOrder(seed.folders),
    hydrated: true,
  };
}

export function persistRegistryState(payload: ScenarioRegistryStateV2) {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(payload));
}

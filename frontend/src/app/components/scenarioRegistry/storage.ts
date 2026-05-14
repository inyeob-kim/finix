import { STORAGE_KEY_V1, STORAGE_KEY_V2 } from "./constants";
import type {
  ScenarioRegistryFolder,
  ScenarioRegistryItem,
  ScenarioRegistryStateV2,
  ServiceCatalogItem,
} from "./types";
import { defaultRegistryV2, nowStamp, safeJsonParse, newId } from "./utils";

function ensureServiceSequence(x: unknown): ServiceCatalogItem[] {
  const seq = (x as { serviceSequence?: ServiceCatalogItem[] } | null)?.serviceSequence;
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

export function loadRegistryState(updatedBy: string): LoadedRegistryState {
  const v2 = safeJsonParse<ScenarioRegistryStateV2>(
    localStorage.getItem(STORAGE_KEY_V2),
  );
  if (v2?.version === 2 && (v2.folders?.length ?? 0) > 0) {
    const folders = v2.folders ?? [];
    const scenarios = (v2.scenarios ?? []).map((x) => {
      const seq = ensureServiceSequence(x);
      if (Array.isArray((x as ScenarioRegistryItem).serviceSequence) && (x as ScenarioRegistryItem).serviceSequence.length > 0) {
        return x;
      }
      return { ...(x as unknown as object), serviceSequence: seq } as ScenarioRegistryItem;
    });
    return {
      folders,
      scenarios,
      selectedFolderId: folders[0]?.id ?? null,
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
      scenarios: v1.map((x) => ({
        ...x,
        folderId: migratedRoot.id,
        serviceSequence: ensureServiceSequence(x),
      })),
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
    selectedFolderId: seed.folders[0]?.id ?? null,
    hydrated: true,
  };
}

export function persistRegistryState(payload: ScenarioRegistryStateV2) {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(payload));
}


import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REGISTRY_PURGE_KEY,
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
} from "./constants";
import { loadRegistryState } from "./storage";
import type { ScenarioRegistryItem, ScenarioRegistryStateV2 } from "./types";

function mockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    _dump: () => Object.fromEntries(store.entries()),
  };
}

describe("scenarioRegistry/storage", () => {
  const ls = mockLocalStorage();

  beforeEach(() => {
    ls.clear();
    vi.stubGlobal("localStorage", ls as unknown as Storage);
    // Skip the one-shot purge so fixture data under test is not wiped.
    localStorage.setItem(REGISTRY_PURGE_KEY, "1");
  });

  it("loads v2 when present", () => {
    const v2: ScenarioRegistryStateV2 = {
      version: 2,
      folders: [
        {
          id: "f1",
          name: "Root",
          parentId: null,
          createdAt: "t",
          updatedAt: "t",
          updatedBy: "u",
        },
      ],
      scenarios: [],
    };
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(v2));
    const loaded = loadRegistryState("u");
    expect(loaded.folders[0]?.id).toBe("f1");
    expect(loaded.selectedFolderId).toBe("f1");
  });

  it("restores persisted selectedFolderId when still valid", () => {
    const v2: ScenarioRegistryStateV2 = {
      version: 2,
      folders: [
        {
          id: "f-z",
          name: "Zeta",
          parentId: null,
          createdAt: "t",
          updatedAt: "t",
          updatedBy: "u",
        },
        {
          id: "f-a",
          name: "Alpha",
          parentId: null,
          createdAt: "t",
          updatedAt: "t",
          updatedBy: "u",
        },
      ],
      scenarios: [],
      selectedFolderId: "f-z",
    };
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(v2));
    const loaded = loadRegistryState("u");
    expect(loaded.selectedFolderId).toBe("f-z");
  });

  it("falls back to first folder in display order when selection missing", () => {
    const v2: ScenarioRegistryStateV2 = {
      version: 2,
      folders: [
        {
          id: "f-z",
          name: "Zeta",
          parentId: null,
          createdAt: "t",
          updatedAt: "t",
          updatedBy: "u",
        },
        {
          id: "f-a",
          name: "Alpha",
          parentId: null,
          createdAt: "t",
          updatedAt: "t",
          updatedBy: "u",
        },
      ],
      scenarios: [],
    };
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(v2));
    const loaded = loadRegistryState("u");
    expect(loaded.selectedFolderId).toBe("f-a");
  });

  it("loads v2 with empty folders without re-seeding", () => {
    const v2: ScenarioRegistryStateV2 = {
      version: 2,
      folders: [],
      scenarios: [],
    };
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(v2));
    const loaded = loadRegistryState("u");
    expect(loaded.folders).toEqual([]);
    expect(loaded.scenarios).toEqual([]);
    expect(loaded.selectedFolderId).toBeNull();
    expect(loaded.hydrated).toBe(true);
  });

  it("migrates v1 to v2", () => {
    const v1: ScenarioRegistryItem[] = [
      {
        id: "s1",
        folderId: "ignored",
        title: "T",
        description: "D",
        tags: [],
        // legacy fields should be tolerated (as unknown)
        serviceSequence: [] as any,
        createdAt: "t",
        updatedAt: "t",
        updatedBy: "u",
      } as ScenarioRegistryItem,
    ];
    localStorage.setItem(STORAGE_KEY_V1, JSON.stringify(v1));
    const loaded = loadRegistryState("u");
    expect(loaded.folders.length).toBe(1);
    expect(loaded.folders[0]?.name).toBe("Migrated");
    expect(loaded.scenarios[0]?.folderId).toBe(loaded.folders[0]?.id);
    // v2 should be persisted
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_V2) ?? "{}").version).toBe(2);
  });

  it("one-shot purge clears stale registry before load", () => {
    localStorage.removeItem(REGISTRY_PURGE_KEY);
    localStorage.setItem(
      STORAGE_KEY_V2,
      JSON.stringify({
        version: 2,
        folders: [
          {
            id: "old",
            name: "CMSvc",
            parentId: null,
            createdAt: "t",
            updatedAt: "t",
            updatedBy: "u",
          },
        ],
        scenarios: [
          {
            id: "s-old",
            folderId: "old",
            title: "stale",
            description: "",
            tags: [],
            serviceSequence: [{ code: "X", name: "X" }],
            createdAt: "t",
            updatedAt: "t",
            updatedBy: "u",
          },
        ],
      } satisfies ScenarioRegistryStateV2),
    );

    const loaded = loadRegistryState("u");
    expect(localStorage.getItem(REGISTRY_PURGE_KEY)).toBe("1");
    expect(loaded.scenarios).toEqual([]);
    expect(loaded.folders).toHaveLength(1);
    expect(loaded.folders[0]?.name).toBe("Default");
  });
});

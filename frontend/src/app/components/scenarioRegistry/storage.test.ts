import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY_V1, STORAGE_KEY_V2 } from "./constants";
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

  it("migrates v1 to v2", () => {
    const v1: ScenarioRegistryItem[] = [
      {
        id: "s1",
        folderId: "ignored",
        title: "T",
        description: "D",
        tags: [],
        status: "active",
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
});


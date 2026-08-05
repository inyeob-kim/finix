import { beforeEach, describe, expect, it, vi } from "vitest";
import { REGISTRY_UI_SESSION_KEY } from "./constants";
import {
  clearRegistryUiSession,
  loadRegistryUiSession,
  saveRegistryUiSession,
} from "./registryUiSession";

function mockSessionStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

describe("registryUiSession", () => {
  const ss = mockSessionStorage();

  beforeEach(() => {
    ss.clear();
    vi.stubGlobal("sessionStorage", ss as unknown as Storage);
  });

  it("round-trips UI session", () => {
    saveRegistryUiSession({
      selectedFolderId: "f1",
      selectedScenarioId: "s1",
      query: "auto",
      tagFilter: "tag",
      previewCollapsed: false,
    });
    const loaded = loadRegistryUiSession();
    expect(loaded?.selectedFolderId).toBe("f1");
    expect(loaded?.selectedScenarioId).toBe("s1");
    expect(loaded?.query).toBe("auto");
    expect(loaded?.tagFilter).toBe("tag");
    expect(loaded?.previewCollapsed).toBe(false);
    expect(sessionStorage.getItem(REGISTRY_UI_SESSION_KEY)).toBeTruthy();
  });

  it("clears session", () => {
    saveRegistryUiSession({
      selectedFolderId: "f1",
      selectedScenarioId: null,
      query: "",
      tagFilter: "",
      previewCollapsed: true,
    });
    clearRegistryUiSession();
    expect(loadRegistryUiSession()).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  repairRegistryFolderLinks,
  resolveScenarioFolderId,
} from "./registryFolderSync";
import type { ScenarioRegistryFolder, ScenarioRegistryItem } from "./types";

const folderA: ScenarioRegistryFolder = {
  id: "f-a",
  name: "A",
  parentId: null,
  createdAt: "t",
  updatedAt: "t",
  updatedBy: "u",
};

const folderB: ScenarioRegistryFolder = {
  id: "f-b",
  name: "B",
  parentId: null,
  createdAt: "t",
  updatedAt: "t",
  updatedBy: "u",
};

const scenario = (folderId: string): ScenarioRegistryItem =>
  ({
    id: "s1",
    folderId,
    title: "T",
    description: "",
    tags: [],
    serviceSequence: [],
    createdAt: "t",
    updatedAt: "t",
    updatedBy: "u",
  }) as ScenarioRegistryItem;

describe("registryFolderSync", () => {
  it("clears selected folder when no collections exist", () => {
    const result = repairRegistryFolderLinks([], [scenario("orphan")], "orphan");
    expect(result.selectedFolderId).toBeNull();
    expect(result.scenarios[0]?.folderId).toBe("orphan");
  });

  it("repairs orphan scenarios and invalid selection", () => {
    const result = repairRegistryFolderLinks(
      [folderA, folderB],
      [scenario(""), scenario("missing")],
      "missing",
    );
    expect(result.selectedFolderId).toBe("f-a");
    expect(result.scenarios.every((s) => s.folderId === "f-a")).toBe(true);
  });

  it("resolves folder id only when collection exists", () => {
    expect(resolveScenarioFolderId("", null, [])).toBeNull();
    expect(resolveScenarioFolderId("", null, [folderA])).toBe("f-a");
    expect(resolveScenarioFolderId("", "f-b", [folderA, folderB])).toBe("f-b");
    expect(resolveScenarioFolderId("", "missing", [folderA])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { buildFolderOptions, buildFolderSummary } from "./folderModel";
import type { ScenarioRegistryFolder, ScenarioRegistryItem } from "./types";

describe("scenarioRegistry/folderModel", () => {
  it("buildFolderOptions sorts roots and children by name", () => {
    const folders: ScenarioRegistryFolder[] = [
      { id: "b", name: "B", parentId: null, createdAt: "t", updatedAt: "t", updatedBy: "u" },
      { id: "a", name: "A", parentId: null, createdAt: "t", updatedAt: "t", updatedBy: "u" },
      { id: "a2", name: "child2", parentId: "a", createdAt: "t", updatedAt: "t", updatedBy: "u" },
      { id: "a1", name: "child1", parentId: "a", createdAt: "t", updatedAt: "t", updatedBy: "u" },
    ];
    const opts = buildFolderOptions(folders);
    expect(opts.map((o) => o.id)).toEqual(["a", "a1", "a2", "b"]);
    expect(opts.find((o) => o.id === "a1")?.depth).toBe(1);
  });

  it("buildFolderSummary aggregates descendants", () => {
    const folders: ScenarioRegistryFolder[] = [
      { id: "root", name: "Root", parentId: null, createdAt: "t", updatedAt: "t", updatedBy: "u" },
      { id: "child", name: "Child", parentId: "root", createdAt: "t", updatedAt: "t", updatedBy: "u" },
    ];
    const items: ScenarioRegistryItem[] = [
      {
        id: "s1",
        folderId: "child",
        title: "T",
        description: "",
        tags: [],
        status: "active",
        serviceSequence: [],
        createdAt: "t",
        updatedAt: "2026-01-01 00:00",
        updatedBy: "u",
      },
    ];
    const summary = buildFolderSummary(folders, items);
    expect(summary.get("root")?.count).toBe(1);
    expect(summary.get("child")?.count).toBe(1);
    expect(summary.get("root")?.lastUpdated).toBe("2026-01-01 00:00");
  });
});


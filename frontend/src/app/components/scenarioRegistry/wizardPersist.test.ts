import { describe, expect, it } from "vitest";
import { emptyPostmanConfig } from "@/lib/scenarioPostmanVariables";
import type { ScenarioRegistryFolder } from "./types";
import {
  buildScenarioRegistryItem,
  resolveScenarioSaveStatus,
  scenarioSaveStatusToBadge,
} from "./wizardPersist";

const folders: ScenarioRegistryFolder[] = [
  {
    id: "f1",
    name: "Root",
    parentId: null,
    createdAt: "t",
    updatedAt: "t",
    updatedBy: "u",
  },
];

const baseInput = {
  wizardStep: 2 as const,
  editingId: null,
  existing: null,
  title: "",
  description: "",
  tagsText: "",
  folderId: "f1",
  selectedFolderId: "f1",
  folders,
  serviceDrafts: [{ id: "d1", code: "PY016", name: "급여" }],
  selectedRulePicks: [],
  stepBindingsByStepKey: {},
  postmanConfig: emptyPostmanConfig(),
  updatedBy: "u",
  newId: () => "new-id",
};

describe("wizardPersist", () => {
  it("draft allows empty title and stamps wizard step", () => {
    const result = buildScenarioRegistryItem({
      ...baseInput,
      mode: "draft",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.saveStatus).toBe("draft");
    expect(result.item.wizardStep).toBe(2);
    expect(result.item.title).toContain("급여");
    expect(result.item.id).toBe("new-id");
  });

  it("ready requires title", () => {
    const result = buildScenarioRegistryItem({
      ...baseInput,
      mode: "ready",
      title: "",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("제목");
  });

  it("ready save clears draft and sets step 3", () => {
    const result = buildScenarioRegistryItem({
      ...baseInput,
      mode: "ready",
      title: "완성본",
      wizardStep: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.saveStatus).toBe("ready");
    expect(result.item.wizardStep).toBe(3);
    expect(result.item.title).toBe("완성본");
  });

  it("requires at least one service", () => {
    const result = buildScenarioRegistryItem({
      ...baseInput,
      mode: "draft",
      serviceDrafts: [],
    });
    expect(result.ok).toBe(false);
  });

  it("draft persists inject/override bindings", () => {
    const result = buildScenarioRegistryItem({
      ...baseInput,
      mode: "draft",
      selectedRulePicks: [
        {
          id: "pick-1",
          serviceCode: "PY016",
          serviceName: "급여",
          title: "case",
        },
      ],
      stepBindingsByStepKey: {
        "pick-1": {
          extracts: [],
          injects: [{ var: "acctNo", json_path: "$.acctNo" }],
          overrides: [{ json_path: "$.amt", value: 100 }],
        },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.stepBindingsByStepKey?.["pick-1"]?.injects).toEqual([
      { var: "acctNo", json_path: "$.acctNo" },
    ]);
    expect(result.item.stepBindingsByStepKey?.["pick-1"]?.overrides).toEqual([
      { json_path: "$.amt", value: 100 },
    ]);
  });

  it("draft update keeps empty bindings map instead of wiping via undefined", () => {
    const existing = {
      id: "s1",
      folderId: "f1",
      title: "기존",
      description: "",
      tags: [] as string[],
      serviceSequence: [{ code: "PY016", name: "급여" }],
      createdAt: "t",
      updatedAt: "t",
      updatedBy: "u",
      stepBindingsByStepKey: {
        "pick-1": {
          extracts: [],
          injects: [{ var: "x", json_path: "$.x" }],
          overrides: [],
        },
      },
    };
    const result = buildScenarioRegistryItem({
      ...baseInput,
      mode: "draft",
      editingId: "s1",
      existing,
      title: "기존",
      stepBindingsByStepKey: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.stepBindingsByStepKey).toEqual({});
  });

  it("maps badge statuses", () => {
    expect(resolveScenarioSaveStatus({})).toBe("ready");
    expect(resolveScenarioSaveStatus({ saveStatus: "draft" })).toBe("draft");
    expect(scenarioSaveStatusToBadge("draft")).toBe("draft");
    expect(scenarioSaveStatusToBadge("ready")).toBe("active");
  });
});

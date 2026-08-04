import { describe, expect, it } from "vitest";
import {
  canExportRegistryScenarioPostman,
  registryScenarioPostmanExportBlockReason,
} from "./registryScenarioExport";
import type { ScenarioRegistryItem } from "@/app/components/scenarioRegistry/types";

function baseItem(
  overrides: Partial<ScenarioRegistryItem> = {},
): ScenarioRegistryItem {
  return {
    id: "s1",
    title: "시나리오",
    folderId: "f1",
    selectedRuleTestcases: [
      {
        id: "p1",
        serviceCode: "A",
        serviceName: "A",
        title: "t1",
        backendTestcaseId: 101,
      },
      {
        id: "p2",
        serviceCode: "B",
        serviceName: "B",
        title: "t2",
        backendTestcaseId: 102,
      },
    ],
    saveStatus: "ready",
    ...overrides,
  } as ScenarioRegistryItem;
}

describe("canExportRegistryScenarioPostman", () => {
  it("allows ready scenarios with all DB ids", () => {
    expect(canExportRegistryScenarioPostman(baseItem())).toBe(true);
    expect(registryScenarioPostmanExportBlockReason(baseItem())).toBeNull();
  });

  it("blocks draft even when DB ids exist", () => {
    const item = baseItem({ saveStatus: "draft" });
    expect(canExportRegistryScenarioPostman(item)).toBe(false);
    expect(registryScenarioPostmanExportBlockReason(item)).toMatch(/임시저장/);
  });

  it("blocks when any pick lacks backendTestcaseId", () => {
    const item = baseItem({
      selectedRuleTestcases: [
        {
          id: "p1",
          serviceCode: "A",
          serviceName: "A",
          title: "t1",
          backendTestcaseId: 101,
        },
        { id: "p2", serviceCode: "B", serviceName: "B", title: "t2" },
      ],
    });
    expect(canExportRegistryScenarioPostman(item)).toBe(false);
    expect(registryScenarioPostmanExportBlockReason(item)).toMatch(/모든 테스트/);
  });

  it("blocks empty picks", () => {
    const item = baseItem({ selectedRuleTestcases: [] });
    expect(canExportRegistryScenarioPostman(item)).toBe(false);
  });
});

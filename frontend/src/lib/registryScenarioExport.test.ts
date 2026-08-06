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
        ruleId: "A-N-001",
      },
      {
        id: "p2",
        serviceCode: "B",
        serviceName: "B",
        title: "t2",
        ruleId: "B-N-001",
      },
    ],
    saveStatus: "ready",
    ...overrides,
  } as ScenarioRegistryItem;
}

describe("canExportRegistryScenarioPostman", () => {
  it("allows ready scenarios with all case_ids", () => {
    expect(canExportRegistryScenarioPostman(baseItem())).toBe(true);
    expect(registryScenarioPostmanExportBlockReason(baseItem())).toBeNull();
  });

  it("blocks draft even when case_ids exist", () => {
    const item = baseItem({ saveStatus: "draft" });
    expect(canExportRegistryScenarioPostman(item)).toBe(false);
    expect(registryScenarioPostmanExportBlockReason(item)).toMatch(/임시저장/);
  });

  it("blocks when any pick lacks case_id", () => {
    const item = baseItem({
      selectedRuleTestcases: [
        {
          id: "p1",
          serviceCode: "A",
          serviceName: "A",
          title: "t1",
          ruleId: "A-N-001",
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

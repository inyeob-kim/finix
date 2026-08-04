export type ServiceCatalogItem = {
  code: string;
  name: string;
};

import type {
  StepBindingsByServiceCode,
  StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";

/** One persisted HTTP test case or legacy YAML rule pick (scenario assembly). */
export type ScenarioRuleTestcaseRef = {
  id: string;
  serviceCode: string;
  serviceName: string;
  /** Parsed from materialized name when present; legacy YAML-only rows use this. */
  ruleId?: string;
  title: string;
  description?: string;
  ruleType?: string;
  /** When set, row came from GET /api/v1/test-cases (DB). */
  backendTestcaseId?: number;
  scenarioId?: number | null;
};

export type ScenarioRegistryFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

export type ScenarioSaveStatus = "draft" | "ready";

export type ScenarioRegistryItem = {
  id: string;
  folderId: string;
  title: string;
  description: string;
  tags: string[];
  serviceSequence: ServiceCatalogItem[];
  /** Persisted test cases (or legacy YAML rule picks) chosen in the wizard. */
  selectedRuleTestcases?: ScenarioRuleTestcaseRef[];
  /** Per-testcase-step extract/inject (keys = pick id, step 1 order). */
  stepBindingsByStepKey?: StepBindingsByStepKey;
  /** Postman collection variables (baseUrl + start vars). */
  postmanConfig?: ScenarioPostmanConfig;
  /** @deprecated Legacy service-code keys; migrated on load. */
  stepBindingsByCode?: StepBindingsByServiceCode;
  /** Set after first DB persist/export; reused to avoid duplicate scenarios. */
  backendScenarioId?: number;
  /**
   * Wizard publish state. Missing → treated as ready (legacy rows).
   * draft = mid-wizard temp save; ready = finished.
   */
  saveStatus?: ScenarioSaveStatus;
  /** Last wizard step when saved as draft (1–3). */
  wizardStep?: 1 | 2 | 3;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

export type ScenarioRegistryStateV2 = {
  version: 2;
  folders: ScenarioRegistryFolder[];
  scenarios: ScenarioRegistryItem[];
};

export type ServiceDraft = {
  id: string;
  code: string;
  name: string;
};

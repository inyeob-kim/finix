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
  /**
   * Natural-key case_id (e.g. ``CU008-N-001``); source of truth for pool identity
   * (paired with serviceCode). Parsed from materialized name when unset.
   */
  ruleId?: string;
  title: string;
  description?: string;
  ruleType?: string;
  /**
   * Fingerprint of pool request_body when this pick was added or last acknowledged.
   * Used to detect live pool changes (not a body snapshot).
   */
  pinnedFingerprint?: string;
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
  /** Last selected collection in the registry UI. */
  selectedFolderId?: string | null;
};

export type ServiceDraft = {
  id: string;
  code: string;
  name: string;
};

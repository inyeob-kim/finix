export type RegistryStatus = "draft" | "active";

export type ServiceCatalogItem = {
  code: string;
  name: string;
};

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

export type ScenarioRegistryItem = {
  id: string;
  folderId: string;
  title: string;
  description: string;
  tags: string[];
  status: RegistryStatus;
  serviceSequence: ServiceCatalogItem[];
  /** Persisted test cases (or legacy YAML rule picks) chosen in the wizard. */
  selectedRuleTestcases?: ScenarioRuleTestcaseRef[];
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


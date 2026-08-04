import type { StepBindingsByStepKey } from "@/lib/scenarioBindings";
import {
  ensurePostmanConfig,
  type ScenarioPostmanConfig,
} from "@/lib/scenarioPostmanVariables";
import { resolveScenarioFolderId } from "./registryFolderSync";
import type {
  ScenarioRegistryFolder,
  ScenarioRegistryItem,
  ScenarioRuleTestcaseRef,
  ScenarioSaveStatus,
  ServiceCatalogItem,
  ServiceDraft,
} from "./types";
import { normalizeTags, nowStamp } from "./utils";

export type WizardPersistInput = {
  mode: ScenarioSaveStatus;
  wizardStep: 1 | 2 | 3;
  editingId: string | null;
  existing: ScenarioRegistryItem | null;
  title: string;
  description: string;
  tagsText: string;
  folderId: string;
  selectedFolderId: string | null;
  folders: ScenarioRegistryFolder[];
  serviceDrafts: ServiceDraft[];
  selectedRulePicks: ScenarioRuleTestcaseRef[];
  stepBindingsByStepKey: StepBindingsByStepKey;
  postmanConfig: ScenarioPostmanConfig;
  updatedBy: string;
  newId: () => string;
};

export type WizardPersistResult =
  | { ok: true; item: ScenarioRegistryItem }
  | { ok: false; error: string };

export function resolveScenarioSaveStatus(
  item: Pick<ScenarioRegistryItem, "saveStatus">,
): ScenarioSaveStatus {
  return item.saveStatus === "draft" ? "draft" : "ready";
}

export function scenarioSaveStatusLabel(status: ScenarioSaveStatus): string {
  return status === "draft" ? "임시저장" : "완료";
}

/** Badge mapping for UI (draft stays draft; ready → active). */
export function scenarioSaveStatusToBadge(
  status: ScenarioSaveStatus,
): "draft" | "active" {
  return status === "draft" ? "draft" : "active";
}

function draftFallbackTitle(serviceDrafts: ServiceDraft[]): string {
  const first = serviceDrafts[0];
  if (first?.name?.trim()) return `(임시) ${first.name.trim()}`;
  if (first?.code?.trim()) return `(임시) ${first.code.trim()}`;
  return "(임시) 제목 없는 시나리오";
}

export function buildScenarioRegistryItem(
  input: WizardPersistInput,
): WizardPersistResult {
  const serviceSequence: ServiceCatalogItem[] = input.serviceDrafts.map(
    (s) => ({
      code: s.code,
      name: s.name,
    }),
  );

  if (serviceSequence.length === 0) {
    return { ok: false, error: "서비스를 1개 이상 추가하세요." };
  }

  const trimmedTitle = input.title.trim();
  if (input.mode === "ready" && !trimmedTitle) {
    return { ok: false, error: "제목은 필수입니다." };
  }

  const resolvedFolderId = resolveScenarioFolderId(
    input.folderId,
    input.selectedFolderId ?? input.existing?.folderId ?? null,
    input.folders,
  );
  if (!resolvedFolderId) {
    return {
      ok: false,
      error: "시나리오를 등록하려면 컬렉션을 먼저 만들고 선택하세요.",
    };
  }

  const stamp = nowStamp();
  const title =
    trimmedTitle ||
    input.existing?.title?.trim() ||
    draftFallbackTitle(input.serviceDrafts);
  const picks = [...input.selectedRulePicks];
  // Always persist the current binding map (including empty) so draft updates
  // cannot wipe prior inject/override rows via `undefined` overwrite.
  const bindings = input.stepBindingsByStepKey;

  const baseFields = {
    folderId: resolvedFolderId,
    title,
    description: input.description.trim(),
    tags: normalizeTags(input.tagsText),
    serviceSequence,
    selectedRuleTestcases: picks.length > 0 ? picks : undefined,
    stepBindingsByStepKey: bindings,
    postmanConfig: ensurePostmanConfig(input.postmanConfig),
    saveStatus: input.mode,
    wizardStep: input.mode === "draft" ? input.wizardStep : 3,
    updatedAt: stamp,
    updatedBy: input.updatedBy,
  } as const;

  if (input.editingId && input.existing) {
    return {
      ok: true,
      item: {
        ...input.existing,
        ...baseFields,
        folderId:
          resolveScenarioFolderId(
            input.folderId,
            input.existing.folderId,
            input.folders,
          ) ?? input.existing.folderId,
      },
    };
  }

  return {
    ok: true,
    item: {
      id: input.newId(),
      createdAt: stamp,
      ...baseFields,
    },
  };
}

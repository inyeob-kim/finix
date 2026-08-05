import { firstFolderIdInDisplayOrder } from "./folderModel";
import type {
  ScenarioRegistryFolder,
  ScenarioRegistryItem,
} from "./types";

export function repairRegistryFolderLinks(
  folders: ScenarioRegistryFolder[],
  scenarios: ScenarioRegistryItem[],
  selectedFolderId: string | null,
): {
  scenarios: ScenarioRegistryItem[];
  selectedFolderId: string | null;
} {
  if (folders.length === 0) {
    return {
      scenarios,
      selectedFolderId: null,
    };
  }

  const folderIds = new Set(folders.map((f) => f.id));
  const fallbackFolderId = firstFolderIdInDisplayOrder(folders);

  const nextSelected =
    selectedFolderId && folderIds.has(selectedFolderId)
      ? selectedFolderId
      : fallbackFolderId;

  const nextScenarios = scenarios.map((scenario) => {
    if (folderIds.has(scenario.folderId)) return scenario;
    if (!fallbackFolderId) return scenario;
    return { ...scenario, folderId: fallbackFolderId };
  });

  return {
    scenarios: nextScenarios,
    selectedFolderId: nextSelected,
  };
}

export function resolveScenarioFolderId(
  folderId: string,
  selectedFolderId: string | null,
  folders: ScenarioRegistryFolder[],
): string | null {
  const candidate =
    folderId || selectedFolderId || firstFolderIdInDisplayOrder(folders) || "";
  if (!candidate) return null;
  return folders.some((folder) => folder.id === candidate) ? candidate : null;
}

import JSZip from "jszip";
import {
  downloadScenarioPostmanCollection,
  fetchScenarioPostmanCollectionBlob,
  downloadBlobAsFile,
} from "@/api/scenarioApi";
import { ApiError } from "@/api/client";
import type { ScenarioRegistryItem } from "@/app/components/scenarioRegistry/types";
import { resolveScenarioSaveStatus } from "@/app/components/scenarioRegistry/wizardPersist";
import { migrateBindingsToStepKeys } from "@/lib/scenarioBindings";
import {
  defaultCollectionPostmanZipName,
  defaultSinglePostmanDownloadName,
  mergeExportPostmanConfig,
  resolvePostmanDownloadName,
} from "@/lib/postmanExportDownload";
import { persistRegistryScenarioToDb } from "@/lib/registryScenarioPersist";
import {
  ensurePostmanConfig,
  postmanConfigToApi,
  type ScenarioPostmanConfig,
} from "@/lib/scenarioPostmanVariables";
import { saveScenarioDefinition } from "@/api/scenarioApi";

function sanitizeFilenameStem(title: string): string {
  const stem = title
    .trim()
    .replace(/[^\w\u3131-\uD79D.-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return stem || "scenario";
}

/** Ready status + every pick has a case_id (natural key link to fnx_testcase). */
export function canExportRegistryScenarioPostman(
  item: ScenarioRegistryItem,
): boolean {
  if (resolveScenarioSaveStatus(item) === "draft") {
    return false;
  }
  const picks = item.selectedRuleTestcases ?? [];
  if (picks.length === 0) {
    return false;
  }
  return picks.every((p) => Boolean(p.ruleId?.trim()));
}

export function registryScenarioPostmanExportBlockReason(
  item: ScenarioRegistryItem,
): string | null {
  if (resolveScenarioSaveStatus(item) === "draft") {
    return "임시저장 시나리오는 완료 저장 후 export할 수 있습니다.";
  }
  const picks = item.selectedRuleTestcases ?? [];
  if (picks.length === 0) {
    return "포스트맨 export를 위해 시나리오에 DB 테스트 케이스가 포함되어 있어야 합니다.";
  }
  if (!picks.every((p) => Boolean(p.ruleId?.trim()))) {
    return "모든 테스트 케이스에 case_id가 필요합니다. 풀에서 다시 선택하세요.";
  }
  return null;
}

function postmanJsonNames(items: ScenarioRegistryItem[]): Map<string, string> {
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  for (const item of items) {
    const stem = sanitizeFilenameStem(item.title);
    const n = (counts.get(stem) ?? 0) + 1;
    counts.set(stem, n);
    const fileStem = n > 1 ? `${stem}-${n}` : stem;
    names.set(item.id, `postman-${fileStem}.json`);
  }
  return names;
}

async function persistRegistryItemForExport(
  item: ScenarioRegistryItem,
): Promise<number> {
  const picks = item.selectedRuleTestcases ?? [];
  const block = registryScenarioPostmanExportBlockReason(item);
  if (block) {
    throw new Error(block);
  }

  const stepBindingsByStepKey = migrateBindingsToStepKeys(
    picks.map((p) => p.id),
    picks,
    item.stepBindingsByStepKey ?? item.stepBindingsByCode,
  );

  const { scenarioId } = await persistRegistryScenarioToDb({
    title: item.title,
    prompt: item.description?.trim() || item.title,
    serviceSequence: item.serviceSequence ?? [],
    stepBindingsByStepKey,
    selectedRuleTestcases: picks,
    postmanConfig: item.postmanConfig,
    existingScenarioId: item.backendScenarioId,
  });
  return scenarioId;
}

/** Persist postman config on an existing scenario and download the collection JSON. */
export async function downloadSavedScenarioPostman(input: {
  scenarioId: number;
  title: string;
  postmanConfig?: ScenarioPostmanConfig;
  downloadName?: string;
}): Promise<void> {
  const postman = postmanConfigToApi(ensurePostmanConfig(input.postmanConfig));
  await saveScenarioDefinition(input.scenarioId, { postman });
  const defaultName = defaultSinglePostmanDownloadName(input.title);
  const downloadName = resolvePostmanDownloadName(
    input.downloadName,
    defaultName,
    ".json",
  );
  await downloadScenarioPostmanCollection(
    input.scenarioId,
    true,
    downloadName,
    true,
  );
}

export async function exportRegistryScenarioPostman(
  item: ScenarioRegistryItem,
  options?: { downloadName?: string },
): Promise<{ scenarioId: number }> {
  try {
    const scenarioId = await persistRegistryItemForExport(item);
    await downloadSavedScenarioPostman({
      scenarioId,
      title: item.title,
      postmanConfig: item.postmanConfig,
      downloadName: options?.downloadName,
    });
    return { scenarioId };
  } catch (e) {
    if (e instanceof ApiError) {
      throw new Error(e.message);
    }
    throw e;
  }
}

export type CollectionPostmanExportResult = {
  exported: number;
  skipped: number;
  scenarioIdsByItemId: Record<string, number>;
  errors: string[];
};

export async function exportRegistryCollectionPostmanZip(
  items: ScenarioRegistryItem[],
  options?: {
    zipDownloadName?: string;
    baseUrlOverride?: string;
    folderLabel?: string;
  },
  onProgress?: (done: number, total: number) => void,
): Promise<CollectionPostmanExportResult> {
  const exportable = items
    .filter(canExportRegistryScenarioPostman)
    .map((item) => ({
      ...item,
      postmanConfig: mergeExportPostmanConfig(
        item.postmanConfig,
        options?.baseUrlOverride,
      ),
    }));
  const skipped = items.length - exportable.length;
  if (exportable.length === 0) {
    throw new Error(
      "다운로드할 시나리오가 없습니다. 완료 저장되고 모든 테스트 케이스가 DB에 있는 시나리오만 export할 수 있습니다.",
    );
  }

  const defaultZip = defaultCollectionPostmanZipName(options?.folderLabel ?? "collection");
  const zipDownloadName = resolvePostmanDownloadName(
    options?.zipDownloadName,
    defaultZip,
    ".zip",
  );

  const fileNames = postmanJsonNames(exportable);
  const zip = new JSZip();
  const errors: string[] = [];
  const scenarioIdsByItemId: Record<string, number> = {};
  let done = 0;

  for (const item of exportable) {
    try {
      const scenarioId = await persistRegistryItemForExport(item);
      scenarioIdsByItemId[item.id] = scenarioId;
      const blob = await fetchScenarioPostmanCollectionBlob(scenarioId, true, true);
      zip.file(fileNames.get(item.id) ?? `postman-${item.id}.json`, blob);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Postman export에 실패했습니다.";
      errors.push(`${item.title}: ${message}`);
    }
    done += 1;
    onProgress?.(done, exportable.length);
  }

  const exported = Object.keys(zip.files).length;
  if (exported === 0) {
    throw new Error(
      errors[0] ?? "Postman 컬렉션을 생성하지 못했습니다.",
    );
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlobAsFile(zipBlob, zipDownloadName);

  return { exported, skipped, scenarioIdsByItemId, errors };
}

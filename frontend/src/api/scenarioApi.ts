import { apiRequest, fetchBlob } from "./client";
import { getRequiredInstCd, withInstCdQuery } from "@/lib/instScope";
import type {
  PostmanCollectionConfigDto,
  ScenarioBindingsSuggestDto,
  ScenarioReadDto,
  ScenarioResolvePreviewDto,
  ScenarioStepDto,
  TestCaseReadDto,
  TestCaseRefDto,
} from "./types";

const PREFIX = "/api/v1/scenarios";

export async function createScenario(body: {
  prompt: string;
  title?: string | null;
}): Promise<ScenarioReadDto> {
  return apiRequest<ScenarioReadDto>(withInstCdQuery(PREFIX), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Empty scenario row for registry sync — no LLM generation. */
export async function createScenarioShell(body: {
  title: string;
  prompt?: string | null;
  is_saved?: boolean;
}): Promise<ScenarioReadDto> {
  return apiRequest<ScenarioReadDto>(withInstCdQuery(`${PREFIX}/shell`), {
    method: "POST",
    body: JSON.stringify({
      title: body.title,
      prompt: body.prompt ?? null,
      is_saved: body.is_saved ?? false,
    }),
  });
}

export async function getScenario(scenarioId: number): Promise<ScenarioReadDto> {
  return apiRequest<ScenarioReadDto>(`${PREFIX}/${scenarioId}`, {
    method: "GET",
  });
}

export async function patchScenario(
  scenarioId: number,
  body: {
    title?: string | null;
    prompt?: string | null;
    steps?: ScenarioStepDto[] | null;
  },
): Promise<ScenarioReadDto> {
  return apiRequest<ScenarioReadDto>(`${PREFIX}/${scenarioId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function attachTestCasesToScenario(
  scenarioId: number,
  perStep: TestCaseRefDto[][],
): Promise<TestCaseReadDto[]> {
  return apiRequest(`${PREFIX}/${scenarioId}/attach-test-cases`, {
    method: "POST",
    body: JSON.stringify({ per_step: perStep }),
  });
}

export async function saveScenarioDefinition(
  scenarioId: number,
  body: {
    title?: string | null;
    prompt?: string | null;
    steps?: ScenarioStepDto[];
    postman?: PostmanCollectionConfigDto | null;
    per_step?: TestCaseRefDto[][];
    mark_saved?: boolean;
  },
): Promise<ScenarioReadDto> {
  return apiRequest<ScenarioReadDto>(`${PREFIX}/${scenarioId}/save-definition`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function resolveScenarioPreview(
  scenarioId: number,
  simulateResponses = true,
): Promise<ScenarioResolvePreviewDto> {
  const q = new URLSearchParams({
    simulate_responses: String(simulateResponses),
  });
  return apiRequest<ScenarioResolvePreviewDto>(
    `${PREFIX}/${scenarioId}/resolve-preview?${q.toString()}`,
    { method: "POST" },
  );
}

export async function suggestScenarioBindings(
  serviceCodes: string[],
): Promise<ScenarioBindingsSuggestDto> {
  return apiRequest<ScenarioBindingsSuggestDto>(`${PREFIX}/suggest-bindings`, {
    method: "POST",
    body: JSON.stringify({ service_codes: serviceCodes }),
  });
}

export async function resolveScenarioPreviewInline(body: {
  steps: ScenarioStepDto[];
  per_step: TestCaseRefDto[][];
  simulate_responses?: boolean;
  instCd?: string | null;
}): Promise<ScenarioResolvePreviewDto> {
  return apiRequest<ScenarioResolvePreviewDto>(`${PREFIX}/resolve-preview`, {
    method: "POST",
    body: JSON.stringify({
      steps: body.steps,
      per_step: body.per_step,
      simulate_responses: body.simulate_responses ?? true,
      inst_cd: getRequiredInstCd(body.instCd),
    }),
  });
}

export async function fetchScenarioPostmanCollectionBlob(
  scenarioId: number,
  resolved = true,
  native = true,
): Promise<Blob> {
  const q = new URLSearchParams({
    resolved: String(resolved),
    native: String(native),
  });
  return fetchBlob(`${PREFIX}/${scenarioId}/export/postman?${q.toString()}`);
}

export function downloadBlobAsFile(blob: Blob, downloadName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadScenarioPostmanCollection(
  scenarioId: number,
  resolved = true,
  downloadName?: string,
  native = true,
): Promise<void> {
  const blob = await fetchScenarioPostmanCollectionBlob(
    scenarioId,
    resolved,
    native,
  );
  downloadBlobAsFile(blob, downloadName ?? `postman-scenario-${scenarioId}.json`);
}

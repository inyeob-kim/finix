import { apiRequest } from "./client";
import type { ScenarioReadDto, ScenarioStepDto } from "./types";

const PREFIX = "/api/v1/scenarios";

export async function createScenario(body: {
  prompt: string;
  title?: string | null;
}): Promise<ScenarioReadDto> {
  return apiRequest<ScenarioReadDto>(PREFIX, {
    method: "POST",
    body: JSON.stringify(body),
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

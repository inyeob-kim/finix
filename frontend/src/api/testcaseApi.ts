import { apiRequest, fetchBlob } from "./client";
import type { TestCaseReadDto } from "./types";

export async function generateTestCases(
  scenarioId: number,
  instruction?: string | null,
): Promise<TestCaseReadDto[]> {
  return apiRequest<TestCaseReadDto[]>(
    `/api/v1/scenarios/${scenarioId}/test-cases/generate`,
    {
      method: "POST",
      body: JSON.stringify({ instruction: instruction ?? null }),
    },
  );
}

export async function listTestCases(
  scenarioId: number,
): Promise<TestCaseReadDto[]> {
  return apiRequest<TestCaseReadDto[]>(
    `/api/v1/scenarios/${scenarioId}/test-cases`,
    { method: "GET" },
  );
}

export async function listTestCasesByServiceCode(
  serviceCode: string,
  limit = 200,
): Promise<TestCaseReadDto[]> {
  const q = new URLSearchParams({
    service_code: serviceCode,
    limit: String(limit),
  });
  return apiRequest<TestCaseReadDto[]>(
    `/api/v1/test-cases?${q.toString()}`,
    { method: "GET" },
  );
}

export async function getTestCase(testCaseId: number): Promise<TestCaseReadDto> {
  return apiRequest<TestCaseReadDto>(`/api/v1/test-cases/${testCaseId}`, {
    method: "GET",
  });
}

export async function downloadPostmanCollection(testcaseId: number): Promise<void> {
  const path = `/api/v1/test-cases/${testcaseId}/export/postman`;
  const blob = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `postman-testcase-${testcaseId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

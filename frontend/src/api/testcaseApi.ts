import { apiRequest, fetchBlob } from "./client";
import {
  streamExecutionEvents,
  type ExecutionStreamEvent,
} from "./executionApi";
import type { ExecutionDetailDto, TestCaseReadDto } from "./types";

type TestCaseExecutionRequest = {
  base_url?: string;
  mode?: "simulate" | "live";
  postman?: {
    base_url?: string;
    header_vars?: Array<{ key: string; value?: string }>;
    start_vars?: Array<{
      key: string;
      value?: string;
      generator?: string;
    }>;
    default_headers?: Array<{ key: string; value?: string }>;
  };
};

function testCaseExecutionBody(body?: TestCaseExecutionRequest) {
  return {
    base_url: body?.base_url ?? "",
    mode: body?.mode ?? "simulate",
    postman: body?.postman ?? null,
  };
}

function serviceTestCasesExecutionPath(serviceCode: string): string {
  return `/api/v1/services/${encodeURIComponent(serviceCode)}/test-cases/executions`;
}

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

/** Materialize HTTP test cases from YAML rules for one service (no scenario). */
export async function materializeTestCasesForService(
  serviceCode: string,
  payload?: {
    instruction?: string | null;
    replace_existing?: boolean;
    bundle_id?: number | null;
    yaml_text?: string | null;
  },
): Promise<TestCaseReadDto[]> {
  return apiRequest<TestCaseReadDto[]>(
    `/api/v1/services/${encodeURIComponent(serviceCode)}/test-cases/materialize`,
    {
      method: "POST",
      body: JSON.stringify({
        instruction: payload?.instruction ?? null,
        replace_existing: payload?.replace_existing ?? true,
        bundle_id: payload?.bundle_id ?? null,
        yaml_text: payload?.yaml_text ?? null,
      }),
    },
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

export async function attachTestCasesToScenario(
  scenarioId: number,
  perStep: number[][],
): Promise<TestCaseReadDto[]> {
  return apiRequest<TestCaseReadDto[]>(
    `/api/v1/scenarios/${scenarioId}/attach-test-cases`,
    {
      method: "POST",
      body: JSON.stringify({ per_step: perStep }),
    },
  );
}

export async function runTestCaseExecution(
  testcaseId: number,
  body?: TestCaseExecutionRequest,
): Promise<ExecutionDetailDto> {
  return apiRequest<ExecutionDetailDto>(
    `/api/v1/test-cases/${testcaseId}/executions`,
    {
      method: "POST",
      body: JSON.stringify(testCaseExecutionBody(body)),
    },
  );
}

/** Run all materialized pool test cases for one service as a single multi-step execution. */
export async function runServiceTestCasesExecution(
  serviceCode: string,
  body?: TestCaseExecutionRequest,
): Promise<ExecutionDetailDto> {
  return apiRequest<ExecutionDetailDto>(
    serviceTestCasesExecutionPath(serviceCode),
    {
      method: "POST",
      body: JSON.stringify(testCaseExecutionBody(body)),
    },
  );
}

/** Same as `runServiceTestCasesExecution`, but streams per-case progress. */
export async function streamServiceTestCasesExecution(
  serviceCode: string,
  body: TestCaseExecutionRequest | undefined,
  onEvent: (event: ExecutionStreamEvent) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<Extract<ExecutionStreamEvent, { type: "done" }>> {
  return streamExecutionEvents(
    `${serviceTestCasesExecutionPath(serviceCode)}/stream`,
    testCaseExecutionBody(body),
    onEvent,
    signal,
  );
}

export async function downloadPostmanCollection(
  testcaseId: number,
  options?: { mode?: "template" | "resolved"; scenarioId?: number },
): Promise<void> {
  const q = new URLSearchParams({ mode: options?.mode ?? "template" });
  if (options?.scenarioId != null) {
    q.set("scenario_id", String(options.scenarioId));
  }
  const path = `/api/v1/test-cases/${testcaseId}/export/postman?${q.toString()}`;
  const blob = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `postman-testcase-${testcaseId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download Postman collection for all pool test cases under a service. */
export async function downloadServicePostmanCollection(
  serviceCode: string,
): Promise<void> {
  const code = serviceCode.trim();
  const path = `/api/v1/services/${encodeURIComponent(code)}/test-cases/export/postman`;
  const blob = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `postman-service-${code || "pool"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

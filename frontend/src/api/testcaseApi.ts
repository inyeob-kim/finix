import { apiRequest, fetchBlob } from "./client";
import {
  streamExecutionEvents,
  type ExecutionStreamEvent,
} from "./executionApi";
import { getRequiredInstCd, withInstCdQuery } from "@/lib/instScope";
import type {
  ExecutionDetailDto,
  MaterializeOneCaseResultDto,
  TestCaseReadDto,
  TestCaseRefDto,
} from "./types";

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
    mode: body?.mode ?? "live",
    postman: body?.postman ?? null,
  };
}

function serviceTestCasesExecutionPath(
  serviceCode: string,
  instCd?: string | null,
): string {
  return withInstCdQuery(
    `/api/v1/services/${encodeURIComponent(serviceCode)}/test-cases/executions`,
    instCd,
  );
}

export async function generateTestCases(
  scenarioId: number,
  instruction?: string | null,
  instCd?: string | null,
): Promise<TestCaseReadDto[]> {
  return apiRequest<TestCaseReadDto[]>(
    withInstCdQuery(
      `/api/v1/scenarios/${scenarioId}/test-cases/generate`,
      instCd,
    ),
    {
      method: "POST",
      body: JSON.stringify({ instruction: instruction ?? null }),
    },
  );
}

export async function listTestCases(
  scenarioId: number,
  instCd?: string | null,
): Promise<TestCaseReadDto[]> {
  return apiRequest<TestCaseReadDto[]>(
    withInstCdQuery(`/api/v1/scenarios/${scenarioId}/test-cases`, instCd),
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
    instCd?: string | null;
  },
): Promise<TestCaseReadDto[]> {
  return apiRequest<TestCaseReadDto[]>(
    withInstCdQuery(
      `/api/v1/services/${encodeURIComponent(serviceCode)}/test-cases/materialize`,
      payload?.instCd,
    ),
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

/** Upsert one pool TC for a rule case_id (other cases untouched). */
export async function materializeOneRuleCase(
  serviceCode: string,
  caseId: string,
  payload?: {
    instruction?: string | null;
    bundle_id?: number | null;
    yaml_text?: string | null;
    instCd?: string | null;
  },
): Promise<MaterializeOneCaseResultDto> {
  return apiRequest<MaterializeOneCaseResultDto>(
    withInstCdQuery(
      `/api/v1/services/${encodeURIComponent(serviceCode)}/cases/${encodeURIComponent(caseId)}/materialize`,
      payload?.instCd,
    ),
    {
      method: "POST",
      body: JSON.stringify({
        instruction: payload?.instruction ?? null,
        bundle_id: payload?.bundle_id ?? null,
        yaml_text: payload?.yaml_text ?? null,
      }),
    },
  );
}

export type RunRuleCaseResultDto = {
  testcase: TestCaseReadDto;
  execution: ExecutionDetailDto;
};

/** Trial-run one rule case from editor YAML (does not write pool/hist). */
export async function runRuleCase(
  serviceCode: string,
  caseId: string,
  payload?: TestCaseExecutionRequest & {
    instruction?: string | null;
    bundle_id?: number | null;
    yaml_text?: string | null;
    instCd?: string | null;
  },
): Promise<RunRuleCaseResultDto> {
  return apiRequest<RunRuleCaseResultDto>(
    withInstCdQuery(
      `/api/v1/services/${encodeURIComponent(serviceCode)}/cases/${encodeURIComponent(caseId)}/run`,
      payload?.instCd,
    ),
    {
      method: "POST",
      body: JSON.stringify({
        instruction: payload?.instruction ?? null,
        bundle_id: payload?.bundle_id ?? null,
        yaml_text: payload?.yaml_text ?? null,
        ...testCaseExecutionBody(payload),
      }),
    },
  );
}

export async function listTestCasesByServiceCode(
  serviceCode: string,
  limit = 200,
  instCd?: string | null,
  options?: { scenarioEligible?: boolean },
): Promise<TestCaseReadDto[]> {
  const q = new URLSearchParams({
    service_code: serviceCode,
    inst_cd: getRequiredInstCd(instCd),
    limit: String(limit),
  });
  if (options?.scenarioEligible) {
    q.set("scenario_eligible", "true");
  }
  return apiRequest<TestCaseReadDto[]>(
    `/api/v1/test-cases?${q.toString()}`,
    { method: "GET" },
  );
}

export async function getTestCase(
  svcCode: string,
  ruleCaseId: string,
  instCd?: string | null,
): Promise<TestCaseReadDto> {
  return apiRequest<TestCaseReadDto>(
    withInstCdQuery(
      `/api/v1/test-cases/${encodeURIComponent(svcCode)}/${encodeURIComponent(ruleCaseId)}`,
      instCd,
    ),
    { method: "GET" },
  );
}

export async function attachTestCasesToScenario(
  scenarioId: number,
  perStep: TestCaseRefDto[][],
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
  svcCode: string,
  ruleCaseId: string,
  body?: TestCaseExecutionRequest,
  instCd?: string | null,
): Promise<ExecutionDetailDto> {
  return apiRequest<ExecutionDetailDto>(
    withInstCdQuery(
      `/api/v1/test-cases/${encodeURIComponent(svcCode)}/${encodeURIComponent(ruleCaseId)}/executions`,
      instCd,
    ),
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
  svcCode: string,
  ruleCaseId: string,
  options?: {
    mode?: "template" | "resolved";
    scenarioId?: number;
    instCd?: string | null;
  },
): Promise<void> {
  const q = new URLSearchParams({
    mode: options?.mode ?? "template",
    inst_cd: getRequiredInstCd(options?.instCd),
  });
  if (options?.scenarioId != null) {
    q.set("scenario_id", String(options.scenarioId));
  }
  const path = `/api/v1/test-cases/${encodeURIComponent(svcCode)}/${encodeURIComponent(ruleCaseId)}/export/postman?${q.toString()}`;
  const blob = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `postman-testcase-${svcCode}-${ruleCaseId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download Postman collection for all pool test cases under a service. */
export async function downloadServicePostmanCollection(
  serviceCode: string,
  instCd?: string | null,
): Promise<void> {
  const code = serviceCode.trim();
  const path = withInstCdQuery(
    `/api/v1/services/${encodeURIComponent(code)}/test-cases/export/postman`,
    instCd,
  );
  const blob = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `postman-service-${code || "pool"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

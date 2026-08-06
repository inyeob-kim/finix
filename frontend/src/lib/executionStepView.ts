import type { ExecutionStepDto } from "@/api/types";

export type ExecutionAssertionView = {
  name: string;
  passed: boolean;
  message: string | null;
};

export type ExecutionStepActualPayload = {
  status?: number;
  body?: unknown;
  context_after?: Record<string, unknown>;
  /** @deprecated legacy key */
  context?: Record<string, unknown>;
  template_request_body?: Record<string, unknown>;
  resolved_request_body?: Record<string, unknown>;
  method?: string;
  endpoint?: string;
  request_url?: string;
  response_time_ms?: number;
  response_size_bytes?: number;
  assertions?: Array<{
    name?: string;
    passed?: boolean;
    message?: string | null;
  }>;
};

export type ExecutionStepExpectedPayload = {
  status?: number;
  body?: unknown;
};

export type ExecutionStepViewModel = {
  stepIndex: number;
  label: string;
  svcCode: string | null;
  ruleCaseId: string | null;
  status: "passed" | "failed";
  errorMessage: string | null;
  method: string | null;
  endpoint: string | null;
  requestUrl: string | null;
  expectedStatus: number | null;
  actualStatus: number | null;
  expectedBody: unknown;
  actualBody: unknown;
  templateRequestBody: Record<string, unknown>;
  resolvedRequestBody: Record<string, unknown>;
  injectedKeys: string[];
  contextAfter: Record<string, unknown>;
  statusMatch: boolean;
  assertions: ExecutionAssertionView[];
  assertionPassedCount: number;
  assertionFailedCount: number;
  responseTimeMs: number | null;
  responseSizeBytes: number | null;
};

export type ExecutionRunSummaryView = {
  passed: number;
  failed: number;
  assertionPassed: number;
  assertionFailed: number;
  durationMs: number | null;
  avgResponseTimeMs: number | null;
  mode: "simulate" | "live" | null;
  totalTests: number;
};

export function prettyExecutionJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatResponseSize(bytes: number | null): string | null {
  if (bytes == null || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(3)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function formatDurationMs(ms: number | null): string | null {
  if (ms == null || ms < 0) return null;
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.floor(ms / 1000);
  const rem = ms % 1000;
  if (rem === 0) return `${sec}s`;
  return `${sec}s ${rem}ms`;
}

export function diffInjectedKeys(
  template: Record<string, unknown>,
  resolved: Record<string, unknown>,
): string[] {
  const keys: string[] = [];
  const walk = (a: unknown, b: unknown, prefix: string) => {
    if (a === b) return;
    if (
      typeof a !== "object" ||
      a === null ||
      typeof b !== "object" ||
      b === null
    ) {
      if (prefix) keys.push(prefix);
      return;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      if (JSON.stringify(a) !== JSON.stringify(b) && prefix) keys.push(prefix);
      return;
    }
    const ak = a as Record<string, unknown>;
    const bk = b as Record<string, unknown>;
    const names = new Set([...Object.keys(ak), ...Object.keys(bk)]);
    for (const k of names) {
      const p = prefix ? `${prefix}.${k}` : k;
      walk(ak[k], bk[k], p);
    }
  };
  walk(template, resolved, "");
  return keys.slice(0, 16);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseAssertionsFromActual(
  actual: ExecutionStepActualPayload,
  step: ExecutionStepDto,
): ExecutionAssertionView[] {
  const raw = actual.assertions;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((row, idx) => ({
      name: String(row.name ?? `Assertion ${idx + 1}`),
      passed: row.passed === true,
      message: row.message?.trim() ? row.message : null,
    }));
  }
  if (step.status === "passed") {
    return [{ name: "Step evaluation", passed: true, message: null }];
  }
  const msg = step.error_message?.trim();
  if (!msg) {
    return [{ name: "Step evaluation", passed: false, message: null }];
  }
  return msg.split("; ").map((part, idx) => ({
    name: idx === 0 ? "Step evaluation" : `Step evaluation (${idx + 1})`,
    passed: false,
    message: part,
  }));
}

export function parseExecutionStep(step: ExecutionStepDto): ExecutionStepViewModel {
  const expected = step.expected as ExecutionStepExpectedPayload;
  const actual = step.actual as ExecutionStepActualPayload;
  const templateRequestBody = asRecord(actual.template_request_body);
  const resolvedRequestBody = asRecord(actual.resolved_request_body);
  const contextAfter = asRecord(actual.context_after ?? actual.context);
  const expectedStatus =
    typeof expected.status === "number" ? expected.status : null;
  const actualStatus =
    typeof actual.status === "number" ? actual.status : null;
  const assertions = parseAssertionsFromActual(actual, step);

  return {
    stepIndex: step.step_index,
    label: step.step_label,
    svcCode: step.svc_code ?? null,
    ruleCaseId: step.rule_case_id ?? null,
    status: step.status,
    errorMessage: step.error_message,
    method: actual.method?.trim() || null,
    endpoint: actual.endpoint?.trim() || null,
    requestUrl: actual.request_url?.trim() || null,
    expectedStatus,
    actualStatus,
    expectedBody: expected.body,
    actualBody: actual.body,
    templateRequestBody,
    resolvedRequestBody,
    injectedKeys: diffInjectedKeys(templateRequestBody, resolvedRequestBody),
    contextAfter,
    statusMatch:
      expectedStatus != null &&
      actualStatus != null &&
      expectedStatus === actualStatus,
    assertions,
    assertionPassedCount: assertions.filter((a) => a.passed).length,
    assertionFailedCount: assertions.filter((a) => !a.passed).length,
    responseTimeMs:
      typeof actual.response_time_ms === "number"
        ? actual.response_time_ms
        : null,
    responseSizeBytes:
      typeof actual.response_size_bytes === "number"
        ? actual.response_size_bytes
        : null,
  };
}

export function parseExecutionRunSummary(
  summary: Record<string, unknown>,
  steps: ExecutionStepViewModel[],
): ExecutionRunSummaryView {
  const passed =
    typeof summary.passed === "number"
      ? summary.passed
      : steps.filter((s) => s.status === "passed").length;
  const failed =
    typeof summary.failed === "number"
      ? summary.failed
      : steps.filter((s) => s.status === "failed").length;
  const assertionPassed =
    typeof summary.assertion_passed === "number"
      ? summary.assertion_passed
      : steps.reduce((n, s) => n + s.assertionPassedCount, 0);
  const assertionFailed =
    typeof summary.assertion_failed === "number"
      ? summary.assertion_failed
      : steps.reduce((n, s) => n + s.assertionFailedCount, 0);
  const durationMs =
    typeof summary.duration_ms === "number" ? summary.duration_ms : null;
  const avgResponseTimeMs =
    typeof summary.avg_response_time_ms === "number"
      ? summary.avg_response_time_ms
      : null;
  const mode = executionModeFromSummary(summary);

  return {
    passed,
    failed,
    assertionPassed,
    assertionFailed,
    durationMs,
    avgResponseTimeMs,
    mode,
    totalTests: assertionPassed + assertionFailed,
  };
}

export function executionModeFromSummary(
  summary: Record<string, unknown>,
): "simulate" | "live" | null {
  const mode = summary.mode;
  if (mode === "simulate" || mode === "live") return mode;
  return null;
}

export type ExecutionResultFilter = "all" | "passed" | "failed";

export function filterExecutionSteps(
  steps: ExecutionStepViewModel[],
  filter: ExecutionResultFilter,
): ExecutionStepViewModel[] {
  if (filter === "passed") {
    return steps.filter((s) => s.status === "passed");
  }
  if (filter === "failed") {
    return steps.filter((s) => s.status === "failed");
  }
  return steps;
}

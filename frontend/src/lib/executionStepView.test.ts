import { describe, expect, it } from "vitest";
import {
  diffInjectedKeys,
  executionModeFromSummary,
  filterExecutionSteps,
  formatDurationMs,
  formatResponseSize,
  parseExecutionRunSummary,
  parseExecutionStep,
} from "./executionStepView";

describe("executionStepView", () => {
  it("parses step payload with inject diff, context, and assertions", () => {
    const vm = parseExecutionStep({
      step_index: 0,
      step_label: "TC-1",
      inst_cd: "FNX",
      svc_code: "PY027",
      rule_case_id: "PY027-N-001",
      status: "passed",
      error_message: null,
      expected: { status: 200, body: { ok: true } },
      actual: {
        status: 200,
        body: { ok: true },
        method: "POST",
        endpoint: "/v1/x",
        request_url: "https://api.test/v1/x",
        response_time_ms: 1250,
        response_size_bytes: 8147,
        template_request_body: { token: "" },
        resolved_request_body: { token: "abc" },
        context_after: { token: "abc" },
        assertions: [
          { name: "Status code is 200", passed: true, message: null },
          { name: "No errorCode in happy path", passed: true, message: null },
        ],
      },
    });

    expect(vm.method).toBe("POST");
    expect(vm.requestUrl).toBe("https://api.test/v1/x");
    expect(vm.injectedKeys).toContain("token");
    expect(vm.contextAfter.token).toBe("abc");
    expect(vm.statusMatch).toBe(true);
    expect(vm.assertions).toHaveLength(2);
    expect(vm.responseTimeMs).toBe(1250);
    expect(formatResponseSize(vm.responseSizeBytes)).toBe("7.956 KB");
  });

  it("falls back to legacy context key and error_message assertions", () => {
    const vm = parseExecutionStep({
      step_index: 1,
      step_label: "TC-2",
      status: "failed",
      error_message: "boom; second",
      expected: { status: 200, body: {} },
      actual: { status: 500, body: {}, context: { x: 1 } },
    });
    expect(vm.contextAfter.x).toBe(1);
    expect(vm.statusMatch).toBe(false);
    expect(vm.assertions).toHaveLength(2);
    expect(vm.assertions[0]?.message).toBe("boom");
  });

  it("diffInjectedKeys finds nested changes", () => {
    expect(
      diffInjectedKeys({ a: { b: 1 } }, { a: { b: 2 } }),
    ).toEqual(["a.b"]);
  });

  it("executionModeFromSummary reads mode", () => {
    expect(executionModeFromSummary({ mode: "live" })).toBe("live");
    expect(executionModeFromSummary({})).toBeNull();
  });

  it("parseExecutionRunSummary aggregates metrics", () => {
    const steps = [
      parseExecutionStep({
        step_index: 0,
        step_label: "A",
        svc_code: "PY027",
        rule_case_id: "PY027-N-001",
        status: "passed",
        error_message: null,
        expected: {},
        actual: {
          assertions: [{ name: "t1", passed: true }],
        },
      }),
    ];
    const summary = parseExecutionRunSummary(
      {
        passed: 1,
        failed: 0,
        assertion_passed: 2,
        assertion_failed: 0,
        duration_ms: 6678,
        avg_response_time_ms: 320,
        mode: "live",
      },
      steps,
    );
    expect(summary.totalTests).toBe(2);
    expect(formatDurationMs(summary.durationMs)).toBe("6s 678ms");
  });

  it("filterExecutionSteps filters by step status", () => {
    const steps = [
      { status: "passed" },
      { status: "failed" },
    ] as ReturnType<typeof parseExecutionStep>[];
    expect(filterExecutionSteps(steps, "failed")).toHaveLength(1);
  });
});

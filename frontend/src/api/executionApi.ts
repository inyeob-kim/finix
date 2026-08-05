import { apiRequest, apiUrl, ApiError } from "./client";
import type {
  ExecutionDetailDto,
  ExecutionListResponseDto,
} from "./types";

export async function runScenarioExecution(body: {
  scenario_id: number;
  base_url?: string;
  mode?: "simulate" | "live";
}): Promise<ExecutionDetailDto> {
  return apiRequest<ExecutionDetailDto>("/api/v1/executions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type ExecutionStreamEvent =
  | {
      type: "run_started";
      execution_id: number;
      total: number;
      scenario_id?: number | null;
    }
  | {
      type: "step_started";
      execution_id: number;
      step_index: number;
      total: number;
      step_label: string;
      testcase_id: number;
    }
  | {
      type: "step_finished";
      execution_id: number;
      step_index: number;
      total: number;
      step_label: string;
      testcase_id: number;
      status: "passed" | "failed";
      error_message?: string | null;
    }
  | {
      type: "done";
      execution_id: number;
      scenario_id?: number | null;
      status: string;
      summary: {
        passed?: number;
        failed?: number;
        [key: string]: unknown;
      };
    }
  | {
      type: "error";
      message: string;
    };

function parseSseChunk(buffer: string): {
  events: ExecutionStreamEvent[];
  rest: string;
} {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: ExecutionStreamEvent[] = [];
  for (const part of parts) {
    const dataLines = part
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (dataLines.length === 0) continue;
    try {
      events.push(JSON.parse(dataLines.join("\n")) as ExecutionStreamEvent);
    } catch {
      /* ignore malformed frame */
    }
  }
  return { events, rest };
}

/** POST a run request and consume its SSE progress frames until `done`. */
export async function streamExecutionEvents(
  path: string,
  body: unknown,
  onEvent: (event: ExecutionStreamEvent) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<Extract<ExecutionStreamEvent, { type: "done" }>> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || res.statusText || `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text) as { detail?: unknown };
      if (typeof json.detail === "string") message = json.detail;
    } catch {
      /* keep text */
    }
    throw new ApiError(res.status, message, text);
  }
  if (!res.body) {
    throw new ApiError(500, "실행 스트림을 열지 못했습니다.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneEvent: Extract<ExecutionStreamEvent, { type: "done" }> | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseChunk(buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) {
      await onEvent(event);
      if (event.type === "error") {
        throw new Error(event.message || "실행에 실패했습니다.");
      }
      if (event.type === "done") {
        doneEvent = event;
      }
    }
  }

  if (buffer.trim()) {
    const parsed = parseSseChunk(`${buffer}\n\n`);
    for (const event of parsed.events) {
      await onEvent(event);
      if (event.type === "error") {
        throw new Error(event.message || "실행에 실패했습니다.");
      }
      if (event.type === "done") {
        doneEvent = event;
      }
    }
  }

  if (!doneEvent) {
    throw new Error("실행이 완료 이벤트 없이 종료되었습니다.");
  }
  return doneEvent;
}

export async function streamScenarioExecution(
  body: {
    scenario_id: number;
    base_url?: string;
    mode?: "simulate" | "live";
  },
  onEvent: (event: ExecutionStreamEvent) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<Extract<ExecutionStreamEvent, { type: "done" }>> {
  return streamExecutionEvents("/api/v1/executions/stream", body, onEvent, signal);
}

export async function getExecution(
  executionId: number,
): Promise<ExecutionDetailDto> {
  return apiRequest<ExecutionDetailDto>(`/api/v1/executions/${executionId}`, {
    method: "GET",
  });
}

export async function listExecutions(params?: {
  limit?: number;
  offset?: number;
  created_from?: string;
  created_to?: string;
  scenario_id?: number;
}): Promise<ExecutionListResponseDto> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  if (params?.created_from) qs.set("created_from", params.created_from);
  if (params?.created_to) qs.set("created_to", params.created_to);
  if (params?.scenario_id != null) {
    qs.set("scenario_id", String(params.scenario_id));
  }
  const query = qs.toString();
  return apiRequest<ExecutionListResponseDto>(
    `/api/v1/executions${query ? `?${query}` : ""}`,
    { method: "GET" },
  );
}

import type { ExecutionStreamEvent } from "@/api/executionApi";
import type {
  ScenarioRunFocusStatus,
  ScenarioRunFocusStep,
} from "@/app/components/scenario/ScenarioRunFocusProgress";

/** Keeps a finished step visible long enough to read its PASS/FAIL badge. */
const STEP_RESULT_HOLD_MS = 480;

export type ExecutionRunProgressState = {
  steps: ScenarioRunFocusStep[];
  currentIndex: number;
  status: ScenarioRunFocusStatus;
  total: number;
};

export type ExecutionStreamRunner = (
  onEvent: (event: ExecutionStreamEvent) => void | Promise<void>,
  signal?: AbortSignal,
) => Promise<Extract<ExecutionStreamEvent, { type: "done" }>>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function upsertFocusStep(
  steps: ScenarioRunFocusStep[],
  index: number,
  label: string,
): ScenarioRunFocusStep[] {
  const next = [...steps];
  while (next.length <= index) {
    next.push({
      key: `step-${next.length}`,
      label: `Step ${next.length + 1}`,
    });
  }
  const prev = next[index];
  next[index] = {
    key: prev?.key ?? `step-${index}`,
    label: label.trim() || prev?.label || `Step ${index + 1}`,
  };
  return next;
}

/** Map SSE run events onto the focus-progress view state. */
export async function consumeExecutionProgressStream(
  runStream: ExecutionStreamRunner,
  seedSteps: ScenarioRunFocusStep[],
  onProgress: (state: ExecutionRunProgressState) => void,
  signal?: AbortSignal,
): Promise<Extract<ExecutionStreamEvent, { type: "done" }>> {
  let steps = seedSteps.length > 0 ? [...seedSteps] : [];
  let currentIndex = 0;
  let status: ScenarioRunFocusStatus = "pending";
  let total = Math.max(steps.length, 1);

  const emit = () => {
    onProgress({ steps, currentIndex, status, total });
  };
  emit();

  return runStream(async (event) => {
    if (event.type === "run_started") {
      total = Math.max(event.total, steps.length, 1);
      emit();
      return;
    }
    if (event.type === "step_started") {
      total = Math.max(event.total, total, 1);
      currentIndex = event.step_index;
      status = "running";
      steps = upsertFocusStep(steps, event.step_index, event.step_label);
      emit();
      return;
    }
    if (event.type === "step_finished") {
      total = Math.max(event.total, total, 1);
      currentIndex = event.step_index;
      status = event.status === "passed" ? "passed" : "failed";
      steps = upsertFocusStep(steps, event.step_index, event.step_label);
      emit();
      await sleep(STEP_RESULT_HOLD_MS);
    }
  }, signal);
}

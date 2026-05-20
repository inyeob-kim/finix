import { useEffect, useMemo, useState } from "react";

export type WaitMessageStep = {
  afterMs: number;
  text: string;
};

/** Default copy for long-running YAML source AI registration. */
export const YAML_AI_WAIT_MESSAGE_STEPS: WaitMessageStep[] = [
  { afterMs: 0, text: "잠시만 기다려 주세요." },
  {
    afterMs: 30_000,
    text: "소스가 길거나 규칙이 많으면 최대 몇 분 걸릴 수 있습니다.\n계속 진행 중입니다.",
  },
  {
    afterMs: 60_000,
    text: "소스에서 검증·업무 규칙을 분석 중입니다.",
  },
  {
    afterMs: 90_000,
    text: "아직 처리 중입니다. 창을 닫지 말고 기다려 주세요.",
  },
];

function resolveWaitMessage(elapsedMs: number, steps: WaitMessageStep[]): string {
  let message = steps[0]?.text ?? "";
  for (const step of steps) {
    if (elapsedMs >= step.afterMs) {
      message = step.text;
    }
  }
  return message;
}

/**
 * Returns wait copy that advances by elapsed time while `active` is true.
 * Resets when loading ends.
 */
export function useProgressiveWaitMessage(
  active: boolean,
  steps: WaitMessageStep[] = YAML_AI_WAIT_MESSAGE_STEPS,
): string {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    setElapsedMs(0);
    const timerId = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [active]);

  return useMemo(
    () => resolveWaitMessage(elapsedMs, steps),
    [elapsedMs, steps],
  );
}

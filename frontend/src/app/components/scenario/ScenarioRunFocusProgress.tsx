import {
  FinixProgressSteps,
  type FinixProgressOverall,
} from "../ui/FinixProgressSteps";

export type ScenarioRunFocusStep = {
  key: string;
  label: string;
};

export type ScenarioRunFocusStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed";

type Props = {
  steps: ScenarioRunFocusStep[];
  currentIndex: number;
  status: ScenarioRunFocusStatus;
  total: number;
};

function toOverall(status: ScenarioRunFocusStatus): FinixProgressOverall {
  if (status === "passed") return "success";
  if (status === "failed") return "error";
  if (status === "running") return "running";
  return "pending";
}

function statusLabel(status: ScenarioRunFocusStatus): string {
  if (status === "passed") return "완료";
  if (status === "failed") return "실패";
  if (status === "running") return "진행 중";
  return "대기";
}

/** Scenario / pool test progress — same step list as YAML jobs. */
export function ScenarioRunFocusProgress({
  steps,
  currentIndex,
  status,
  total,
}: Props) {
  const safeTotal = Math.max(total, steps.length, 1);
  const displayIndex = Math.min(Math.max(currentIndex, 0), safeTotal - 1);
  const overall = toOverall(status);
  const progress =
    overall === "success" || overall === "error"
      ? 100
      : Math.round(((displayIndex + (overall === "running" ? 0.35 : 0)) / safeTotal) * 100);

  return (
    <FinixProgressSteps
      steps={steps.map((s) => ({ id: s.key, label: s.label }))}
      currentIndex={displayIndex}
      status={overall === "pending" ? "running" : overall}
      progress={progress}
      metaLeft={`테스트 케이스 ${Math.min(displayIndex + 1, safeTotal)} / ${safeTotal}`}
      metaRight={statusLabel(status)}
      className="py-1"
    />
  );
}

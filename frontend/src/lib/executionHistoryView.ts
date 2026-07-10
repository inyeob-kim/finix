import type { ExecutionListItemDto } from "@/api/types";
import { executionModeFromSummary } from "@/lib/executionStepView";

export type ExecutionHistoryStatus = "success" | "failed" | "running";

export type ExecutionHistoryRow = {
  id: number;
  scenarioId: number | null;
  scenarioTitle: string;
  occurredAt: string;
  status: ExecutionHistoryStatus;
  modeLabel: string;
  baseUrl: string;
  passed: number;
  failed: number;
  summary: string;
};

export type ExecutionHistoryDatePreset = "today" | "7d" | "30d" | "all" | "custom";

export function daysAgoDateInputValue(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function historyPresetLabel(preset: ExecutionHistoryDatePreset): string {
  switch (preset) {
    case "today":
      return "오늘";
    case "7d":
      return "최근 7일";
    case "30d":
      return "최근 30일";
    case "all":
      return "전체 기간";
    default:
      return "선택 일자";
  }
}

export function todayDateInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localDayRangeIso(
  date: string,
  timeStart: string,
  timeEnd: string,
): { created_from: string; created_to: string } {
  const from = new Date(`${date}T${timeStart}:00`);
  const to = new Date(`${date}T${timeEnd}:59`);
  return {
    created_from: from.toISOString(),
    created_to: to.toISOString(),
  };
}

export function historyQueryRange(input: {
  preset: ExecutionHistoryDatePreset;
  dateFrom: string;
  timeStart: string;
  timeEnd: string;
}): { created_from?: string; created_to?: string } {
  const end = localDayRangeIso(
    todayDateInputValue(),
    "00:00",
    "23:59",
  ).created_to;

  if (input.preset === "all") {
    return {};
  }
  if (input.preset === "today") {
    return localDayRangeIso(todayDateInputValue(), "00:00", "23:59");
  }
  if (input.preset === "7d") {
    return {
      created_from: localDayRangeIso(daysAgoDateInputValue(6), "00:00", "23:59")
        .created_from,
      created_to: end,
    };
  }
  if (input.preset === "30d") {
    return {
      created_from: localDayRangeIso(daysAgoDateInputValue(29), "00:00", "23:59")
        .created_from,
      created_to: end,
    };
  }
  return localDayRangeIso(input.dateFrom, input.timeStart, input.timeEnd);
}

export function deriveExecutionHistoryStatus(
  item: ExecutionListItemDto,
): ExecutionHistoryStatus {
  if (item.status === "running") return "running";
  const failed = Number(item.summary?.failed ?? 0);
  if (failed > 0) return "failed";
  return "success";
}

export function executionModeLabel(
  summary: Record<string, unknown>,
): string {
  const mode = executionModeFromSummary(summary);
  if (mode === "live") return "실행 API";
  if (mode === "simulate") return "시뮬레이션";
  return "모드 알 수 없음";
}

export function formatExecutionSummary(
  item: ExecutionListItemDto,
): string {
  const passed = Number(item.summary?.passed ?? 0);
  const failed = Number(item.summary?.failed ?? 0);
  const total = passed + failed;
  if (total === 0) return "실행 단계 없음";
  if (failed > 0) return `${total}단계 중 ${failed}건 실패`;
  return `${total}단계 모두 성공`;
}

export function mapExecutionListItem(
  item: ExecutionListItemDto,
  scenarioTitle?: string | null,
): ExecutionHistoryRow {
  const passed = Number(item.summary?.passed ?? 0);
  const failed = Number(item.summary?.failed ?? 0);
  const title =
    scenarioTitle?.trim() ||
    (item.scenario_id != null ? `시나리오 #${item.scenario_id}` : "—");

  return {
    id: item.id,
    scenarioId: item.scenario_id,
    scenarioTitle: title,
    occurredAt: new Date(item.created_at).toLocaleString("ko-KR"),
    status: deriveExecutionHistoryStatus(item),
    modeLabel: executionModeLabel(item.summary),
    baseUrl: item.base_url?.trim() || "—",
    passed,
    failed,
    summary: formatExecutionSummary(item),
  };
}

export function filterHistoryRows(
  rows: ExecutionHistoryRow[],
  searchText: string,
  failuresOnly = false,
): ExecutionHistoryRow[] {
  let out = rows;
  if (failuresOnly) {
    out = out.filter((row) => row.status === "failed");
  }
  const q = searchText.trim().toLowerCase();
  if (!q) return out;
  return out.filter((row) => {
    return (
      String(row.id).includes(q) ||
      row.scenarioTitle.toLowerCase().includes(q) ||
      row.baseUrl.toLowerCase().includes(q) ||
      row.summary.toLowerCase().includes(q) ||
      row.modeLabel.toLowerCase().includes(q)
    );
  });
}

export async function resolveScenarioTitles(
  scenarioIds: Array<number | null>,
  fetchTitle: (id: number) => Promise<string | null>,
): Promise<Map<number, string>> {
  const unique = [
    ...new Set(scenarioIds.filter((id): id is number => id != null)),
  ];
  const entries = await Promise.all(
    unique.map(async (id) => {
      try {
        const title = await fetchTitle(id);
        return [id, title ?? ""] as const;
      } catch {
        return [id, ""] as const;
      }
    }),
  );
  return new Map(entries.filter(([, title]) => title.length > 0));
}

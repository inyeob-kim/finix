import { getExecution } from "@/api/executionApi";
import { getScenario } from "@/api/scenarioApi";
import { ApiError } from "@/api/client";
import type { ExecutionDetailDto } from "@/api/types";
import type { ExecutionBatchListItem } from "@/lib/executionBatchView";

export type LoadedBatchExecution = {
  detail: ExecutionDetailDto;
  scenarioTitle: string | null;
  listItem: ExecutionBatchListItem;
};

export async function loadBatchExecutions(
  ids: number[],
  titleByExecutionId?: Map<number, string>,
): Promise<{ loaded: LoadedBatchExecution[]; errors: string[] }> {
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const detail = await getExecution(id);
        let title = titleByExecutionId?.get(id) ?? null;
        if (!title && detail.scenario_id != null) {
          try {
            const scenario = await getScenario(detail.scenario_id);
            title = scenario.title ?? null;
          } catch {
            title = null;
          }
        }
        const passed = Number(detail.summary?.passed ?? 0);
        const failed = Number(detail.summary?.failed ?? 0);
        const listItem: ExecutionBatchListItem = {
          executionId: detail.id,
          title: title?.trim() || `시나리오 #${detail.scenario_id ?? detail.id}`,
          scenarioId: detail.scenario_id ?? 0,
          passed,
          failed,
          failedScenario: failed > 0,
        };
        return { ok: true as const, loaded: { detail, scenarioTitle: title, listItem } };
      } catch (e) {
        const message =
          e instanceof ApiError ? e.message : "실행 결과를 불러오지 못했습니다.";
        return { ok: false as const, error: `#${id}: ${message}` };
      }
    }),
  );

  const loaded: LoadedBatchExecution[] = [];
  const errors: string[] = [];
  for (const row of results) {
    if (row.ok) loaded.push(row.loaded);
    else errors.push(row.error);
  }
  loaded.sort((a, b) => a.detail.id - b.detail.id);
  return { loaded, errors };
}

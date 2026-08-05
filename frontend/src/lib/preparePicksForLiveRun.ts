import { listTestCasesByServiceCode } from "@/api/testcaseApi";
import type { ScenarioRuleTestcaseRef } from "@/app/components/scenarioRegistry/types";
import { parseMaterializedTestcaseName } from "@/lib/materializedTestcaseName";
import {
  anyPickBlocksRun,
  fingerprintRequestBody,
  hydratePickFingerprints,
  rebindPicksToLivePool,
} from "@/lib/poolCaseLiveRef";

function mapPoolRow(
  row: {
    id: number;
    name: string;
    scenario_id: number | null;
    case_id?: string | null;
    request_body: Record<string, unknown>;
  },
  serviceCode: string,
  serviceName: string,
): ScenarioRuleTestcaseRef {
  const parsed = parseMaterializedTestcaseName(row.name, serviceCode);
  return {
    id: `tc-${row.id}`,
    serviceCode,
    serviceName,
    ruleId: row.case_id?.trim() || parsed.ruleId,
    ruleType: parsed.ruleType,
    title: row.name,
    description: parsed.shortLabel,
    backendTestcaseId: row.id,
    scenarioId: row.scenario_id,
    pinnedFingerprint: fingerprintRequestBody(row.request_body),
  };
}

/** Fetch current pool rows for the services used by picks. */
export async function loadPoolRefsForPicks(
  picks: ScenarioRuleTestcaseRef[],
): Promise<ScenarioRuleTestcaseRef[]> {
  const codes = [...new Set(picks.map((p) => p.serviceCode).filter(Boolean))];
  const merged: ScenarioRuleTestcaseRef[] = [];
  const seen = new Set<number>();
  for (const code of codes) {
    try {
      const rows = await listTestCasesByServiceCode(code, 500);
      for (const row of rows) {
        if (row.scenario_id != null) continue;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(mapPoolRow(row, code, code));
      }
    } catch {
      // ignore per-service errors
    }
  }
  return merged;
}

export async function preparePicksForLiveRun(
  picks: ScenarioRuleTestcaseRef[],
): Promise<{ picks: ScenarioRuleTestcaseRef[]; error: string | null }> {
  const pool = await loadPoolRefsForPicks(picks);
  const rebound = rebindPicksToLivePool(picks, pool);
  const hydrated = hydratePickFingerprints(rebound, pool);
  const error = anyPickBlocksRun(hydrated, pool);
  return { picks: hydrated, error };
}

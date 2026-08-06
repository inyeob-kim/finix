import { listTestCasesByServiceCode } from "@/api/testcaseApi";
import type { TestCaseReadDto } from "@/api/types";
import type { ScenarioRuleTestcaseRef } from "@/app/components/scenarioRegistry/types";
import { parseMaterializedTestcaseName } from "@/lib/materializedTestcaseName";
import {
  anyPickBlocksRun,
  fingerprintRequestBody,
  hydratePickFingerprints,
  rebindPicksToLivePool,
} from "@/lib/poolCaseLiveRef";

function mapPoolRow(
  row: TestCaseReadDto,
  serviceCode: string,
  serviceName: string,
): ScenarioRuleTestcaseRef {
  const parsed = parseMaterializedTestcaseName(row.name, serviceCode);
  const ruleId = row.rule_case_id.trim() || row.case_id?.trim() || parsed.ruleId;
  return {
    id: `tc-${serviceCode}-${row.rule_case_id}`,
    serviceCode,
    serviceName,
    ruleId,
    ruleType: parsed.ruleType,
    title: row.name,
    description: parsed.shortLabel,
    pinnedFingerprint: fingerprintRequestBody(row.request_body),
  };
}

/** Fetch current pool rows for the services used by picks. */
export async function loadPoolRefsForPicks(
  picks: ScenarioRuleTestcaseRef[],
): Promise<ScenarioRuleTestcaseRef[]> {
  const codes = [...new Set(picks.map((p) => p.serviceCode).filter(Boolean))];
  const merged: ScenarioRuleTestcaseRef[] = [];
  const seen = new Set<string>();
  for (const code of codes) {
    try {
      const rows = await listTestCasesByServiceCode(code, 500);
      for (const row of rows) {
        const key = `${row.svc_code}/${row.rule_case_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
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

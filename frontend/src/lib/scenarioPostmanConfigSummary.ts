import {
  defaultPostmanHeaderRows,
  refreshTxDtHeader,
  type PostmanHeaderRow,
} from "@/lib/scenarioPostmanHeaders";
import {
  startVarKeysFromConfig,
  type ScenarioPostmanConfig,
} from "@/lib/scenarioPostmanVariables";

export type PostmanCollectionCardSummary = {
  baseUrlSet: boolean;
  baseUrlPreview: string;
  varCount: number;
  varPreview: string[];
  headerCount: number;
  headersArePlatformDefault: boolean;
  showEmptyCta: boolean;
};

function normalizedHeaderPairs(
  headers: PostmanHeaderRow[],
): Array<{ key: string; value: string }> {
  return headers
    .map((r) => ({ key: r.key.trim(), value: r.value }))
    .filter((r) => r.key)
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function headersMatchPlatformDefaults(
  config: ScenarioPostmanConfig,
): boolean {
  const current = normalizedHeaderPairs(
    refreshTxDtHeader(config.defaultHeaders ?? []),
  );
  const defaults = normalizedHeaderPairs(defaultPostmanHeaderRows());
  if (current.length !== defaults.length) return false;
  return current.every(
    (row, i) => row.key === defaults[i].key && row.value === defaults[i].value,
  );
}

export function postmanCollectionCardSummary(
  config: ScenarioPostmanConfig,
): PostmanCollectionCardSummary {
  const keys = startVarKeysFromConfig(config);
  const baseUrl = config.baseUrl.trim();
  const headerCount = (config.defaultHeaders ?? []).filter((h) =>
    h.key.trim(),
  ).length;

  return {
    baseUrlSet: Boolean(baseUrl),
    baseUrlPreview:
      baseUrl.length > 32 ? `${baseUrl.slice(0, 30)}…` : baseUrl,
    varCount: keys.length,
    varPreview: keys.slice(0, 2),
    headerCount,
    headersArePlatformDefault: headersMatchPlatformDefaults(config),
    showEmptyCta: keys.length === 0 && !baseUrl,
  };
}

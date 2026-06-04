import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";

export type PostmanHeaderRow = {
  id: string;
  key: string;
  value: string;
};

const FCC_HEADER_TEMPLATE: ReadonlyArray<{ key: string; value: string }> = [
  { key: "Content-Type", value: "application/json" },
  { key: "instCd", value: "1001" },
  { key: "deptId", value: "10001" },
  { key: "txDt", value: "" },
  { key: "staffId", value: "1000013" },
  { key: "aprvlId", value: "" },
  { key: "srvcCd", value: "" },
  { key: "scrnId", value: "" },
];

/** FCC channel date header value (YYYYMMDD, local timezone). */
export function fccTxDateToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function newHeaderRow(key = "", value = ""): PostmanHeaderRow {
  return { id: crypto.randomUUID(), key, value };
}

export function defaultPostmanHeaderRows(): PostmanHeaderRow[] {
  const today = fccTxDateToday();
  return FCC_HEADER_TEMPLATE.map((row) =>
    newHeaderRow(row.key, row.key === "txDt" ? today : row.value),
  );
}

export function refreshTxDtHeader(headers: PostmanHeaderRow[]): PostmanHeaderRow[] {
  const today = fccTxDateToday();
  return headers.map((row) =>
    row.key.trim().toLowerCase() === "txdt" ? { ...row, value: today } : row,
  );
}

const LEGACY_PLACEHOLDER_HEADER_KEYS = new Set([
  "instCd",
  "deptId",
  "txDt",
  "staffId",
]);

export function isPostmanPlaceholderValue(value: string): boolean {
  return /^\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}$/.test(value.trim());
}

/** Replace old {{instCd}}-style FCC header rows with literal platform defaults. */
export function migrateLegacyPostmanHeaders(
  headers: PostmanHeaderRow[],
): PostmanHeaderRow[] {
  const hasLegacy = headers.some(
    (row) =>
      LEGACY_PLACEHOLDER_HEADER_KEYS.has(row.key.trim()) &&
      isPostmanPlaceholderValue(row.value),
  );
  if (!hasLegacy) return refreshTxDtHeader(headers);
  return defaultPostmanHeaderRows();
}

export function ensureDefaultHeaders(
  headers: PostmanHeaderRow[] | undefined,
): PostmanHeaderRow[] {
  if (!headers || headers.length === 0) return defaultPostmanHeaderRows();
  return refreshTxDtHeader(headers);
}

export function headerKeysFromConfig(config: ScenarioPostmanConfig): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of config.defaultHeaders ?? []) {
    const k = row.key.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function headersSummaryText(
  config: ScenarioPostmanConfig,
  maxNames = 2,
): string {
  const keys = headerKeysFromConfig(config);
  if (keys.length === 0) return "없음";
  if (keys.length <= maxNames) return keys.join(", ");
  const shown = keys.slice(0, maxNames).join(", ");
  return `${shown} 외 ${keys.length - maxNames}개`;
}

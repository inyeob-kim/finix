import type { TestCaseReadDto } from "@/api/types";

/** Parsed fields from YAML-materialized test case display names. */
export type MaterializedTestCaseMeta = {
  pathKind: "N" | "E" | null;
  caseId: string | null;
  /** Name without leading `[N|E] caseId · ` prefix when present. */
  shortLabel: string;
};

const NAME_PREFIX = /^\[([EN])\]\s+(\S+)(?:\s*·\s*([\s\S]*))?$/;

export function parseMaterializedTestCaseName(
  name: string,
): MaterializedTestCaseMeta {
  const trimmed = (name || "").trim();
  const match = NAME_PREFIX.exec(trimmed);
  if (!match) {
    return { pathKind: null, caseId: null, shortLabel: trimmed };
  }
  const pathKind = match[1] as "N" | "E";
  const caseId = match[2] ?? null;
  const rest = (match[3] ?? "").trim();
  return {
    pathKind,
    caseId,
    shortLabel: rest || trimmed,
  };
}

export function inferPathKindFromTestCase(
  test: TestCaseReadDto,
): "N" | "E" | null {
  const fromName = parseMaterializedTestCaseName(test.name).pathKind;
  if (fromName) return fromName;
  if (test.expected_status == null) return null;
  return test.expected_status < 400 ? "N" : "E";
}

export function formatTestCaseCreatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export function testCaseMatchesQuery(
  test: TestCaseReadDto,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const meta = parseMaterializedTestCaseName(test.name);
  const haystack = [
    String(test.id),
    test.name,
    meta.caseId ?? "",
    meta.shortLabel,
    test.method ?? "",
    test.endpoint ?? "",
    test.scenario_id != null ? String(test.scenario_id) : "",
    test.expected_status != null ? String(test.expected_status) : "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/** Order by case_id (numeric-aware), then id. */
export function compareTestCasesByCaseId(
  a: TestCaseReadDto,
  b: TestCaseReadDto,
): number {
  const caseA = parseMaterializedTestCaseName(a.name).caseId ?? a.name;
  const caseB = parseMaterializedTestCaseName(b.name).caseId ?? b.name;
  const byCase = caseA.localeCompare(caseB, "en", {
    numeric: true,
    sensitivity: "base",
  });
  if (byCase !== 0) return byCase;
  return a.id - b.id;
}

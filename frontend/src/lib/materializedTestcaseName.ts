/** Parsed fields from a DB materialized test-case `name`. */
export type ParsedMaterializedTestcaseName = {
  ruleId?: string;
  ruleType?: "E" | "N";
  /** Human label after case_id / error_code (new format). */
  shortLabel?: string;
  /** Full stored name (for navigation / legacy). */
  title: string;
};

const NEW_PREFIX = /^\[(E|N)\]\s+(\S+)/;
const INSTRUCTION_SUFFIX = /\s+\([^)]+\)$/;

function stripInstructionSuffix(name: string): string {
  return name.replace(INSTRUCTION_SUFFIX, "").trim();
}

/** Parse new `[E] case_id · …` or legacy `{serviceCode} case_id …` names. */
export function parseMaterializedTestcaseName(
  name: string,
  serviceCode?: string,
): ParsedMaterializedTestcaseName {
  const title = name.trim();
  if (!title) {
    return { title: "" };
  }

  const base = stripInstructionSuffix(title);
  const newMatch = base.match(NEW_PREFIX);
  if (newMatch) {
    const ruleType = newMatch[1] as "E" | "N";
    const ruleId = newMatch[2];
    const rest = base.slice(newMatch[0].length).trim();
    let shortLabel: string | undefined;
    if (rest.startsWith("·")) {
      const segments = rest
        .slice(1)
        .split("·")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ruleType === "E" && segments.length >= 2) {
        shortLabel = segments.slice(1).join(" · ");
      } else if (segments.length > 0) {
        shortLabel = segments.join(" · ");
      }
    }
    return { ruleId, ruleType, shortLabel, title };
  }

  const code = (serviceCode ?? "").trim();
  if (code) {
    const prefix = `${code} `;
    if (base.startsWith(prefix)) {
      const rest = base.slice(prefix.length).trim();
      const firstSpace = rest.indexOf(" ");
      const ruleId =
        firstSpace > 0 ? rest.slice(0, firstSpace) : rest || undefined;
      return { ruleId, title };
    }
  }

  return { title };
}

import yaml from "js-yaml";

export type YamlCaseType = "E" | "N";

export type YamlRuleRecord = {
  case_id?: string;
  rule_id?: string;
  rule_type?: string;
  title?: string;
  description?: string;
  input?: Record<string, unknown>;
  minimal_input?: Record<string, unknown>;
  expect?: Record<string, unknown>;
  assertions?: unknown[];
  tags?: unknown[];
  source_evidence?: Record<string, unknown>;
  [key: string]: unknown;
};

export type YamlRulesDocument = {
  service_code?: string;
  service_name?: string;
  source_version?: string;
  dto?: unknown;
  rules?: YamlRuleRecord[];
  [key: string]: unknown;
};

export type ParseYamlResult =
  | { ok: true; doc: YamlRulesDocument }
  | { ok: false; error: string };

const CASE_TYPE_SUFFIX: Record<string, string> = {
  E: "E",
  N: "N",
};

export function getCaseId(rule: YamlRuleRecord): string {
  const cid = rule.case_id ?? rule.rule_id;
  return typeof cid === "string" ? cid.trim() : "";
}

export function getRuleInput(rule: YamlRuleRecord): Record<string, unknown> {
  const input = rule.input ?? rule.minimal_input;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

export function normalizeCaseType(ruleType: string | undefined): YamlCaseType {
  const raw = String(ruleType ?? "").trim();
  if (raw.toUpperCase() === "E" || raw.toLowerCase() === "error") return "E";
  return "N";
}

export function caseTypeLabel(ruleType: string | undefined): string {
  return normalizeCaseType(ruleType) === "E" ? "Error (E)" : "Normal (N)";
}

export function parseYamlRulesDocument(text: string): ParseYamlResult {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return { ok: false, error: "YAML이 비어 있습니다." };
  }
  try {
    const loaded = yaml.load(trimmed);
    if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) {
      return { ok: false, error: "YAML 최상위는 객체여야 합니다." };
    }
    return { ok: true, doc: loaded as YamlRulesDocument };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "YAML 파싱 실패";
    return { ok: false, error: msg };
  }
}

export function dumpYamlRulesDocument(doc: YamlRulesDocument): string {
  return yaml.dump(doc, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

export function formatYamlRulesText(text: string): ParseYamlResult & { text?: string } {
  const parsed = parseYamlRulesDocument(text);
  if (!parsed.ok) return parsed;
  return { ok: true, doc: parsed.doc, text: dumpYamlRulesDocument(parsed.doc) };
}

export type RuleFieldUpdate = {
  index: number;
  title?: string;
  description?: string;
  input?: Record<string, unknown>;
  expect?: Record<string, unknown>;
  tags?: string[];
};

export function applyRuleFieldUpdates(
  text: string,
  updates: RuleFieldUpdate[],
): ParseYamlResult & { text?: string } {
  const parsed = parseYamlRulesDocument(text);
  if (!parsed.ok) return parsed;
  const rules = parsed.doc.rules;
  if (!Array.isArray(rules)) {
    return { ok: false, error: "rules 배열이 없습니다." };
  }
  for (const u of updates) {
    const rule = rules[u.index];
    if (!rule || typeof rule !== "object") continue;
    if (u.title !== undefined) {
      rule.title = u.title;
    }
    if (u.description !== undefined) {
      rule.description = u.description;
    }
    if (u.input !== undefined) {
      rule.input = u.input;
      delete rule.minimal_input;
    }
    if (u.expect !== undefined) {
      rule.expect = u.expect;
    }
    if (u.tags !== undefined) {
      rule.tags = u.tags;
    }
  }
  return {
    ok: true,
    doc: parsed.doc,
    text: dumpYamlRulesDocument(parsed.doc),
  };
}

export function removeRuleAtIndex(
  text: string,
  index: number,
): ParseYamlResult & { text?: string } {
  const parsed = parseYamlRulesDocument(text);
  if (!parsed.ok) return parsed;

  const rules = parsed.doc.rules;
  if (!Array.isArray(rules)) {
    return { ok: false, error: "rules 배열이 없습니다." };
  }
  if (rules.length <= 1) {
    return { ok: false, error: "규칙은 최소 1개 이상 있어야 합니다." };
  }
  if (!rules[index] || typeof rules[index] !== "object") {
    return { ok: false, error: `rules[${index}]를 찾을 수 없습니다.` };
  }

  rules.splice(index, 1);

  return {
    ok: true,
    doc: parsed.doc,
    text: dumpYamlRulesDocument(parsed.doc),
  };
}

function collectCaseIds(rules: YamlRuleRecord[]): Set<string> {
  const ids = new Set<string>();
  for (const r of rules) {
    const cid = getCaseId(r);
    if (cid) ids.add(cid);
  }
  return ids;
}

export function suggestNextCaseId(
  serviceCode: string,
  caseType: YamlCaseType,
  existingIds: Iterable<string>,
): string {
  const code = serviceCode.trim() || "SVC";
  const suffix = CASE_TYPE_SUFFIX[caseType] ?? "E";
  const prefix = `${code}-${suffix}-`;
  const ids = new Set(existingIds);

  let max = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const num = Number.parseInt(id.slice(prefix.length), 10);
    if (!Number.isNaN(num)) {
      max = Math.max(max, num);
    }
  }

  let n = max + 1;
  while (n < 999) {
    const candidate = `${prefix}${String(n).padStart(3, "0")}`;
    if (!ids.has(candidate)) {
      return candidate;
    }
    n += 1;
  }
  return `${prefix}${String(Date.now()).slice(-3)}`;
}

function cloneRule(rule: YamlRuleRecord): YamlRuleRecord {
  const copy = JSON.parse(JSON.stringify(rule)) as YamlRuleRecord;
  delete copy.rule_id;
  delete copy.minimal_input;
  delete copy.severity;
  return copy;
}

export function createMinimalCase(
  serviceCode: string,
  caseType: YamlCaseType = "E",
  existingIds: Iterable<string> = [],
): YamlRuleRecord {
  const case_id = suggestNextCaseId(serviceCode, caseType, existingIds);
  const isError = caseType === "E";
  return {
    case_id,
    rule_type: caseType,
    title: "",
    description: "",
    input: {},
    expect: isError
      ? { outcome: "error", http_status: 400, error_code: "" }
      : {
          outcome: "success",
          http_status: 200,
          validation_target: "",
        },
    assertions: isError
      ? [{ path: "$.error_code", op: "equals", value: "" }]
      : [{ path: "$.txDt", op: "not_null" }],
    tags: [isError ? "input" : "business"],
    source_evidence: {
      method: "",
      snippet: "",
    },
  };
}

export function duplicateRuleAtIndex(
  text: string,
  index: number,
): ParseYamlResult & { text?: string; newIndex?: number } {
  const parsed = parseYamlRulesDocument(text);
  if (!parsed.ok) return parsed;

  const rules = parsed.doc.rules;
  if (!Array.isArray(rules)) {
    return { ok: false, error: "rules 배열이 없습니다." };
  }
  const source = rules[index];
  if (!source || typeof source !== "object") {
    return { ok: false, error: `rules[${index}]를 찾을 수 없습니다.` };
  }

  const serviceCode = String(parsed.doc.service_code ?? "").trim();
  const copy = cloneRule(source as YamlRuleRecord);
  const ids = collectCaseIds(rules as YamlRuleRecord[]);
  const caseType = normalizeCaseType(String(copy.rule_type ?? "E"));
  copy.case_id = suggestNextCaseId(serviceCode, caseType, ids);
  copy.rule_type = caseType;
  if (typeof copy.title === "string" && copy.title.trim()) {
    copy.title = `${copy.title.trim()} (복사)`;
  }

  const newIndex = index + 1;
  rules.splice(newIndex, 0, copy);

  return {
    ok: true,
    doc: parsed.doc,
    text: dumpYamlRulesDocument(parsed.doc),
    newIndex,
  };
}

/** @deprecated Use YamlCaseType */
export type YamlRuleType = YamlCaseType;

export function setRulesOrder(
  text: string,
  orderedRules: YamlRuleRecord[],
): ParseYamlResult & { text?: string } {
  const parsed = parseYamlRulesDocument(text);
  if (!parsed.ok) return parsed;
  if (!Array.isArray(parsed.doc.rules)) {
    return { ok: false, error: "rules 배열이 없습니다." };
  }
  parsed.doc.rules = orderedRules;
  return {
    ok: true,
    doc: parsed.doc,
    text: dumpYamlRulesDocument(parsed.doc),
  };
}

export function appendBlankRule(
  text: string,
  caseType: YamlCaseType,
  serviceCodeOverride?: string,
): ParseYamlResult & { text?: string; newIndex?: number } {
  const trimmed = (text || "").trim();
  let parsed = parseYamlRulesDocument(text);

  if (!parsed.ok && !trimmed && (serviceCodeOverride || "").trim()) {
    parsed = {
      ok: true,
      doc: {
        service_code: serviceCodeOverride!.trim(),
        rules: [],
      },
    };
  }
  if (!parsed.ok) return parsed;

  if (!Array.isArray(parsed.doc.rules)) {
    parsed.doc.rules = [];
  }
  const rules = parsed.doc.rules;

  const serviceCode = String(
    parsed.doc.service_code ?? serviceCodeOverride ?? "",
  ).trim();
  if (serviceCode && !parsed.doc.service_code) {
    parsed.doc.service_code = serviceCode;
  }

  const ids = collectCaseIds(rules as YamlRuleRecord[]);
  const newRule = createMinimalCase(serviceCode || "SVC", caseType, ids);

  const newIndex = rules.length;
  rules.push(newRule);

  return {
    ok: true,
    doc: parsed.doc,
    text: dumpYamlRulesDocument(parsed.doc),
    newIndex,
  };
}

export function parseJsonObject(
  raw: string,
  label: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: {} };
  try {
    const v = JSON.parse(trimmed) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      return { ok: false, error: `${label}은 JSON 객체여야 합니다.` };
    }
    return { ok: true, value: v as Record<string, unknown> };
  } catch {
    return { ok: false, error: `${label} JSON 형식이 올바르지 않습니다.` };
  }
}

export function normalizeTagsFromRule(rule: YamlRuleRecord): { input: boolean; business: boolean } {
  const tags = Array.isArray(rule.tags) ? rule.tags : [];
  const normalized = tags.map((t) => String(t).trim().toLowerCase());
  return {
    input: normalized.includes("input"),
    business: normalized.includes("business"),
  };
}

export function tagsFromDraft(input: boolean, business: boolean): string[] {
  const tags: string[] = [];
  if (input) tags.push("input");
  if (business) tags.push("business");
  return tags;
}

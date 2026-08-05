/** CBS service taxonomy helpers (mirrors backend `cbs_service_taxonomy`). */

export const UNCLASSIFIED_DOMAIN = "UNCLASSIFIED";

const DOMAIN_BY_PREFIX: Record<string, string> = {
  AC: "ACCOUNTING",
  AM: "ASSESSMENT",
  AR: "ARRANGEMENT",
  AS: "ASSET",
  AT: "ACTOR",
  BP: "PARTNER",
  CL: "COLLATERAL",
  CM: "COMMON",
  CR: "CALCULATOR",
  CU: "CUSTOMER",
  DC: "DOCUMENT",
  DP: "DEPOSIT",
  DT: "DEPARTMENT",
  FX: "FOREIGNEXCHANGE",
  IA: "INTERNALACCOUNT",
  LM: "LIMIT",
  LN: "LOAN",
  PD: "PRODUCT",
  PY: "PAYMENT",
  SF: "STAFF",
  ST: "SETTLEMENT",
  SV: "SERVICEMANAGEMENT",
  TR: "TREASURY",
  UE: "UNDEREXAMINATION",
  XP: "EXTERNALPROXY",
};

export type RulesDomainSelection =
  | { type: "all" }
  | { type: "domain"; domain: string };

export type RulesDomainNavNode = {
  domain: string;
  count: number;
};

export function inferBusinessDomain(serviceCode: string): string {
  const code = (serviceCode || "").trim().toUpperCase();
  if (code.length < 2) return UNCLASSIFIED_DOMAIN;
  return DOMAIN_BY_PREFIX[code.slice(0, 2)] ?? UNCLASSIFIED_DOMAIN;
}

export function domainLabel(domain: string): string {
  if (!domain || domain === UNCLASSIFIED_DOMAIN) return "미분류";
  return domain;
}

export function selectionKey(sel: RulesDomainSelection): string {
  if (sel.type === "all") return "all";
  return `domain:${sel.domain}`;
}

export function matchesDomainSelection(
  item: { businessDomain: string },
  sel: RulesDomainSelection,
): boolean {
  if (sel.type === "all") return true;
  return item.businessDomain === sel.domain;
}

export function buildDomainNavNodes(
  items: { businessDomain: string }[],
): RulesDomainNavNode[] {
  const byDomain = new Map<string, number>();

  for (const item of items) {
    const domain = item.businessDomain || UNCLASSIFIED_DOMAIN;
    byDomain.set(domain, (byDomain.get(domain) ?? 0) + 1);
  }

  return [...byDomain.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => {
      if (a.domain === UNCLASSIFIED_DOMAIN) return 1;
      if (b.domain === UNCLASSIFIED_DOMAIN) return -1;
      return a.domain.localeCompare(b.domain, "en");
    });
}

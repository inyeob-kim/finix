import { describe, expect, it } from "vitest";
import type { ScenarioRuleTestcaseRef } from "@/app/components/scenarioRegistry/types";
import {
  acknowledgePickFingerprint,
  anyPickBlocksRun,
  evaluatePickLiveHealth,
  fingerprintRequestBody,
  hydratePickFingerprints,
} from "@/lib/poolCaseLiveRef";

function pick(
  partial: Partial<ScenarioRuleTestcaseRef> &
    Pick<ScenarioRuleTestcaseRef, "id" | "serviceCode" | "title">,
): ScenarioRuleTestcaseRef {
  return {
    serviceName: partial.serviceCode,
    ...partial,
  };
}

describe("poolCaseLiveRef", () => {
  const bodyA = { acctOpnYn: "N" };
  const bodyB = { acctOpnYn: "Y" };
  const fpA = fingerprintRequestBody(bodyA);
  const fpB = fingerprintRequestBody(bodyB);
  const fpEmpty = fingerprintRequestBody({});

  const pool: ScenarioRuleTestcaseRef[] = [
    pick({
      id: "tc-1",
      serviceCode: "CU008",
      ruleId: "CU008-N-001",
      title: "[N] CU008-N-001 · ok",
      backendTestcaseId: 11,
      pinnedFingerprint: fpA,
    }),
  ];

  it("detects missing pool case", () => {
    const health = evaluatePickLiveHealth(
      pick({
        id: "p1",
        serviceCode: "CU008",
        ruleId: "CU008-N-999",
        title: "missing",
        pinnedFingerprint: fpA,
      }),
      pool,
    );
    expect(health.status).toBe("missing");
  });

  it("detects empty body", () => {
    const emptyPool = [
      pick({
        id: "tc-2",
        serviceCode: "CU008",
        ruleId: "CU008-N-001",
        title: "[N] CU008-N-001",
        backendTestcaseId: 12,
        pinnedFingerprint: fpEmpty,
      }),
    ];
    const health = evaluatePickLiveHealth(
      pick({
        id: "p1",
        serviceCode: "CU008",
        ruleId: "CU008-N-001",
        title: "x",
        pinnedFingerprint: fpA,
      }),
      emptyPool,
    );
    expect(health.status).toBe("empty");
  });

  it("detects changed body and acknowledge clears it", () => {
    const selected = pick({
      id: "p1",
      serviceCode: "CU008",
      ruleId: "CU008-N-001",
      title: "x",
      pinnedFingerprint: fpA,
    });
    const changedPool = [
      pick({
        id: "tc-1",
        serviceCode: "CU008",
        ruleId: "CU008-N-001",
        title: "[N] CU008-N-001 · ok",
        backendTestcaseId: 11,
        pinnedFingerprint: fpB,
      }),
    ];
    expect(evaluatePickLiveHealth(selected, changedPool).status).toBe("changed");
    expect(anyPickBlocksRun([selected], changedPool)).toContain("변경");
    const acked = acknowledgePickFingerprint(selected, changedPool);
    expect(evaluatePickLiveHealth(acked, changedPool).status).toBe("ok");
  });

  it("hydrates missing fingerprint from live pool", () => {
    const selected = pick({
      id: "p1",
      serviceCode: "CU008",
      ruleId: "CU008-N-001",
      title: "x",
    });
    const next = hydratePickFingerprints([selected], pool);
    expect(next[0]?.pinnedFingerprint).toBe(fpA);
  });
});

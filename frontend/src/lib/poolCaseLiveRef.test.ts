import { describe, expect, it } from "vitest";
import type { ScenarioRuleTestcaseRef } from "@/app/components/scenarioRegistry/types";
import {
  acknowledgePickFingerprint,
  anyPickBlocksRun,
  evaluatePickLiveHealth,
  fingerprintRequestBody,
  formatPinFlowLabel,
  formatPinnedVersionLine,
  hydratePickFingerprints,
  resolveTcPinBadge,
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
        pinnedFingerprint: fpB,
      }),
    ];
    expect(evaluatePickLiveHealth(selected, changedPool).status).toBe("changed");
    expect(anyPickBlocksRun([selected], changedPool)).toBeNull();
    const acked = acknowledgePickFingerprint(selected, changedPool);
    expect(evaluatePickLiveHealth(acked, changedPool).status).toBe("ok");
  });

  it("acknowledge bumps tcHistVersion to live", () => {
    const selected = pick({
      id: "p1",
      serviceCode: "CU008",
      ruleId: "CU008-N-001",
      title: "x",
      pinnedFingerprint: fpA,
      tcHistVersion: 1,
    });
    const changedPool = [
      pick({
        id: "tc-1",
        serviceCode: "CU008",
        ruleId: "CU008-N-001",
        title: "[N] CU008-N-001 · ok",
        pinnedFingerprint: fpB,
        tcHistVersion: 2,
        requestBody: bodyB,
      }),
    ];
    const acked = acknowledgePickFingerprint(selected, changedPool);
    expect(acked.tcHistVersion).toBe(2);
    expect(acked.pinnedFingerprint).toBe(fpB);
    expect(acked.requestBody).toEqual(bodyB);
  });

  it("acknowledge copies live requestBody even when version already matches", () => {
    const selected = pick({
      id: "p1",
      serviceCode: "CU008",
      ruleId: "CU008-N-001",
      title: "x",
      pinnedFingerprint: fpA,
      tcHistVersion: 1,
    });
    const sameVersionNewBody = [
      pick({
        id: "tc-1",
        serviceCode: "CU008",
        ruleId: "CU008-N-001",
        title: "[N] CU008-N-001 · ok",
        pinnedFingerprint: fpB,
        tcHistVersion: 1,
        requestBody: bodyB,
      }),
    ];
    const acked = acknowledgePickFingerprint(selected, sameVersionNewBody);
    expect(acked.tcHistVersion).toBe(1);
    expect(acked.pinnedFingerprint).toBe(fpB);
    expect(acked.requestBody).toEqual(bodyB);
  });

  it("hydrates missing fingerprint and version from live pool", () => {
    const selected = pick({
      id: "p1",
      serviceCode: "CU008",
      ruleId: "CU008-N-001",
      title: "x",
    });
    const poolWithVersion = [
      pick({
        id: "tc-1",
        serviceCode: "CU008",
        ruleId: "CU008-N-001",
        title: "[N] CU008-N-001 · ok",
        pinnedFingerprint: fpA,
        tcHistVersion: 3,
      }),
    ];
    const next = hydratePickFingerprints([selected], poolWithVersion);
    expect(next[0]?.pinnedFingerprint).toBe(fpA);
    expect(next[0]?.tcHistVersion).toBe(3);
  });

  it("formatPinnedVersionLine shows pool drift", () => {
    expect(formatPinnedVersionLine(3, 5)).toBe("v3 (최신 v5)");
    expect(formatPinnedVersionLine(3, 3)).toBe("v3");
    expect(formatPinnedVersionLine(undefined, 5)).toBe("미핀");
    expect(formatPinFlowLabel(2)).toBe("v2");
    expect(formatPinFlowLabel(undefined)).toBe("미핀");
    expect(
      resolveTcPinBadge(
        pick({
          id: "p1",
          serviceCode: "CU008",
          title: "x",
          tcHistVersion: 1,
        }),
        { status: "changed", message: "x", liveVersion: 2, pinnedVersion: 1 },
      ),
    ).toBeNull();
  });
});

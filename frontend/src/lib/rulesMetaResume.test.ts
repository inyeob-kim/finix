import { afterEach, describe, expect, it } from "vitest";
import {
  clearRulesMetaResume,
  peekRulesMetaResume,
  saveRulesMetaResume,
  takeRulesMetaResume,
} from "./rulesMetaResume";

describe("rulesMetaResume", () => {
  afterEach(() => {
    clearRulesMetaResume();
  });

  it("saves and takes resume state", () => {
    saveRulesMetaResume({
      serviceCode: "SC001",
      bundleId: 12,
      activeTab: "testcases",
    });
    const peeked = peekRulesMetaResume();
    expect(peeked?.serviceCode).toBe("SC001");
    expect(peeked?.bundleId).toBe(12);
    expect(peeked?.activeTab).toBe("testcases");

    const taken = takeRulesMetaResume();
    expect(taken?.serviceCode).toBe("SC001");
    expect(peekRulesMetaResume()).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  emptyPostmanConfig,
  ensurePostmanConfig,
  splitStartVarsForUi,
  startVarKeysForBodyChips,
  upsertCustomStartVar,
} from "./scenarioPostmanVariables";

describe("upsertCustomStartVar", () => {
  it("requires literal value or generator (name alone is rejected)", () => {
    const base = ensurePostmanConfig(emptyPostmanConfig());
    expect(upsertCustomStartVar(base, "custId")).toBe(base);
    expect(upsertCustomStartVar(base, "custId", "")).toBe(base);
    expect(upsertCustomStartVar(base, "custId", { value: "" })).toBe(base);
  });

  it("registers a literal collection var visible on body chips", () => {
    const base = ensurePostmanConfig(emptyPostmanConfig());
    expect(startVarKeysForBodyChips(base)).toEqual([]);

    const next = upsertCustomStartVar(base, "custId", "C001");
    expect(startVarKeysForBodyChips(next)).toEqual(["custId"]);

    const { customVars, channelVars } = splitStartVarsForUi(next);
    expect(customVars.some((r) => r.key === "custId" && r.value === "C001")).toBe(
      true,
    );
    expect(customVars.find((r) => r.key === "custId")?.generator).toBeFalsy();
    expect(channelVars.some((r) => r.key === "instCd")).toBe(true);
  });

  it("registers a dynamic collection var with generator", () => {
    const base = ensurePostmanConfig(emptyPostmanConfig());
    const next = upsertCustomStartVar(base, "custRrn", {
      generator: "korean_rrn",
    });
    const row = splitStartVarsForUi(next).customVars.find((r) => r.key === "custRrn");
    expect(row?.generator).toBe("korean_rrn");
    expect(row?.value).toBe("");
    expect(startVarKeysForBodyChips(next)).toEqual(["custRrn"]);
  });

  it("allows the same key as a header var on collection vars", () => {
    const base = ensurePostmanConfig(emptyPostmanConfig());
    const next = upsertCustomStartVar(base, "txDt", {
      generator: "today_yyyymmdd",
    });
    expect(startVarKeysForBodyChips(next)).toEqual(["txDt"]);
    const { customVars, channelVars } = splitStartVarsForUi(next);
    expect(customVars.find((r) => r.key === "txDt")?.generator).toBe(
      "today_yyyymmdd",
    );
    expect(channelVars.find((r) => r.key === "txDt")?.generator).toBeFalsy();
  });

  it("updates existing custom var without duplicating", () => {
    const base = upsertCustomStartVar(
      ensurePostmanConfig(emptyPostmanConfig()),
      "acctNo",
      "1",
    );
    const next = upsertCustomStartVar(base, "acctNo", "2");
    const { customVars } = splitStartVarsForUi(next);
    expect(customVars.filter((r) => r.key === "acctNo")).toHaveLength(1);
    expect(customVars.find((r) => r.key === "acctNo")?.value).toBe("2");
  });
});

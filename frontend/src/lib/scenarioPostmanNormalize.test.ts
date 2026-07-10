import { describe, expect, it } from "vitest";
import { newHeaderRow } from "@/lib/scenarioPostmanHeaders";
import {
  emptyPostmanConfig,
  ensureBxmStartVars,
  normalizePostmanConfigWithMeta,
  splitStartVarsForUi,
} from "@/lib/scenarioPostmanVariables";

describe("normalizePostmanConfigWithMeta", () => {
  it("strips BXM channel keys from headers and keeps them in start_vars", () => {
    const cfg = {
      ...emptyPostmanConfig(),
      defaultHeaders: [
        newHeaderRow("Content-Type", "application/json"),
        newHeaderRow("instCd", "2002"),
        newHeaderRow("deptId", "20002"),
      ],
    };
    const { config, migratedHeaderCount } = normalizePostmanConfigWithMeta(cfg);
    expect(migratedHeaderCount).toBe(2);
    expect(config.defaultHeaders.some((h) => h.key === "instCd")).toBe(false);
    expect(config.startVars.find((v) => v.key === "instCd")?.value).toBe("2002");
    expect(config.startVars.find((v) => v.key === "deptId")?.value).toBe("20002");
  });

  it("preserves custom start vars alongside BXM defaults", () => {
    const rows = ensureBxmStartVars([
      { id: "1", key: "custId", value: "C-99" },
    ]);
    expect(rows.some((r) => r.key === "custId" && r.value === "C-99")).toBe(true);
    expect(rows.some((r) => r.key === "instCd")).toBe(true);
  });

  it("migrates legacy staffId default to 1100000013", () => {
    const rows = ensureBxmStartVars([
      { id: "1", key: "staffId", value: "1000013" },
    ]);
    expect(rows.find((r) => r.key === "staffId")?.value).toBe("1100000013");
  });

  it("splits UI sections for channel and custom vars", () => {
    const cfg = {
      ...emptyPostmanConfig(),
      startVars: [
        ...emptyPostmanConfig().startVars,
        { id: "c1", key: "custId", value: "X" },
      ],
    };
    const split = splitStartVarsForUi(cfg);
    expect(split.channelVars.map((r) => r.key)).toEqual([
      "instCd",
      "chnlDscd",
      "deptId",
      "txDt",
      "staffId",
      "aprvlId",
      "srvcCd",
      "scrnId",
    ]);
    expect(split.customVars).toHaveLength(1);
    expect(split.customVars[0]?.key).toBe("custId");
  });
});

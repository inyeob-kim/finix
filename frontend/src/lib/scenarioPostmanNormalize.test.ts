import { describe, expect, it } from "vitest";
import { newHeaderRow } from "@/lib/scenarioPostmanHeaders";
import {
  emptyPostmanConfig,
  ensureBxmHeaderVars,
  ensureBxmStartVars,
  normalizePostmanConfigWithMeta,
  splitStartVarsForUi,
} from "@/lib/scenarioPostmanVariables";

describe("normalizePostmanConfigWithMeta", () => {
  it("strips BXM channel keys from headers and keeps them in header_vars", () => {
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
    expect(config.headerVars.find((v) => v.key === "instCd")?.value).toBe("2002");
    expect(config.headerVars.find((v) => v.key === "deptId")?.value).toBe("20002");
  });

  it("preserves custom start vars alongside BXM header defaults", () => {
    const rows = ensureBxmStartVars([
      { id: "1", key: "custId", value: "C-99" },
    ]);
    expect(rows.some((r) => r.key === "custId" && r.value === "C-99")).toBe(true);
    expect(rows.some((r) => r.key === "instCd")).toBe(true);
  });

  it("migrates legacy staffId default to 1100000013", () => {
    const rows = ensureBxmHeaderVars([
      { id: "1", key: "staffId", value: "1000013" },
    ]);
    expect(rows.find((r) => r.key === "staffId")?.value).toBe("1100000013");
  });

  it("splits UI sections for header and collection vars", () => {
    const cfg = {
      ...emptyPostmanConfig(),
      startVars: [{ id: "c1", key: "custId", value: "X" }],
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

  it("migrates legacy flat start_vars into header_vars + collection", () => {
    const { config } = normalizePostmanConfigWithMeta({
      baseUrl: "",
      headerVars: [],
      startVars: [
        { id: "1", key: "instCd", value: "2002" },
        { id: "2", key: "custId", value: "C-1" },
      ],
      defaultHeaders: [newHeaderRow("Content-Type", "application/json")],
    });
    expect(config.headerVars.find((v) => v.key === "instCd")?.value).toBe("2002");
    expect(config.startVars.map((v) => v.key)).toEqual(["custId"]);
  });
});

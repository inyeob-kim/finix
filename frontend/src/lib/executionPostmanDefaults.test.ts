import { describe, expect, it, beforeEach } from "vitest";
import {
  loadExecutionPostmanDefaults,
  mergeWithExecutionDefaults,
  saveExecutionPostmanDefaults,
} from "@/lib/executionPostmanDefaults";
import { emptyPostmanConfig } from "@/lib/scenarioPostmanVariables";

describe("executionPostmanDefaults", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads empty defaults when storage is empty", () => {
    const cfg = loadExecutionPostmanDefaults();
    expect(cfg.baseUrl).toBe("");
    expect(cfg.headerVars.some((r) => r.key === "instCd")).toBe(true);
  });

  it("saves and reloads baseUrl and header values", () => {
    saveExecutionPostmanDefaults({
      ...emptyPostmanConfig(),
      baseUrl: "https://cbs.example",
      headerVars: emptyPostmanConfig().headerVars.map((r) =>
        r.key === "staffId" ? { ...r, value: "999" } : r,
      ),
    });
    const loaded = loadExecutionPostmanDefaults();
    expect(loaded.baseUrl).toBe("https://cbs.example");
    expect(loaded.headerVars.find((r) => r.key === "staffId")?.value).toBe(
      "999",
    );
    expect(loaded.startVars).toEqual([]);
  });

  it("merges scenario overrides over shared defaults", () => {
    saveExecutionPostmanDefaults({
      ...emptyPostmanConfig(),
      baseUrl: "https://default.example",
      headerVars: emptyPostmanConfig().headerVars.map((r) =>
        r.key === "deptId" ? { ...r, value: "DEPT-DEFAULT" } : r,
      ),
    });
    const merged = mergeWithExecutionDefaults({
      ...emptyPostmanConfig(),
      baseUrl: "",
      headerVars: emptyPostmanConfig().headerVars.map((r) =>
        r.key === "deptId" ? { ...r, value: "DEPT-SCENARIO" } : r,
      ),
      startVars: [
        {
          id: "1",
          key: "custNo",
          value: "C1",
          generator: null,
        },
      ],
    });
    expect(merged.baseUrl).toBe("https://default.example");
    expect(merged.headerVars.find((r) => r.key === "deptId")?.value).toBe(
      "DEPT-SCENARIO",
    );
    expect(merged.startVars.map((r) => r.key)).toEqual(["custNo"]);
  });
});

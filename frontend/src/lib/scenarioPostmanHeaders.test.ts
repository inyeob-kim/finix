import { describe, expect, it } from "vitest";
import {
  defaultPostmanHeaderRows,
  ensureDefaultHeaders,
  fccTxDateToday,
  isPostmanPlaceholderValue,
  migrateLegacyPostmanHeaders,
  refreshTxDtHeader,
} from "@/lib/scenarioPostmanHeaders";

describe("scenarioPostmanHeaders", () => {
  it("fccTxDateToday returns YYYYMMDD", () => {
    expect(fccTxDateToday()).toMatch(/^\d{8}$/);
  });

  it("defaultPostmanHeaderRows uses FCC literals and today txDt", () => {
    const rows = defaultPostmanHeaderRows();
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(byKey["Content-Type"]).toBe("application/json");
    expect(byKey.instCd).toBe("1001");
    expect(byKey.deptId).toBe("10001");
    expect(byKey.txDt).toBe(fccTxDateToday());
    expect(byKey.staffId).toBe("1000013");
    expect(byKey.aprvlId).toBe("");
  });

  it("refreshTxDtHeader updates stale txDt", () => {
    const rows = defaultPostmanHeaderRows();
    const stale = rows.map((r) =>
      r.key === "txDt" ? { ...r, value: "19990101" } : r,
    );
    const next = refreshTxDtHeader(stale);
    expect(next.find((r) => r.key === "txDt")?.value).toBe(fccTxDateToday());
  });

  it("ensureDefaultHeaders returns defaults when empty", () => {
    const rows = ensureDefaultHeaders(undefined);
    expect(rows.length).toBe(8);
  });

  it("isPostmanPlaceholderValue detects {{var}} syntax", () => {
    expect(isPostmanPlaceholderValue("{{instCd}}")).toBe(true);
    expect(isPostmanPlaceholderValue("1001")).toBe(false);
  });

  it("migrateLegacyPostmanHeaders replaces {{instCd}} rows with FCC literals", () => {
    const legacy = [
      { key: "instCd", value: "{{instCd}}", enabled: true },
      { key: "deptId", value: "{{deptId}}", enabled: true },
    ];
    const next = migrateLegacyPostmanHeaders(legacy);
    const byKey = Object.fromEntries(next.map((r) => [r.key, r.value]));
    expect(byKey.instCd).toBe("1001");
    expect(byKey.deptId).toBe("10001");
    expect(byKey.txDt).toBe(fccTxDateToday());
  });

  it("migrateLegacyPostmanHeaders keeps custom literals", () => {
    const custom = defaultPostmanHeaderRows().map((r) =>
      r.key === "instCd" ? { ...r, value: "9999" } : r,
    );
    const next = migrateLegacyPostmanHeaders(custom);
    expect(next.find((r) => r.key === "instCd")?.value).toBe("9999");
  });
});

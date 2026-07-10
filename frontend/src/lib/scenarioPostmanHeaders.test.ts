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

  it("defaultPostmanHeaderRows uses Content-Type only", () => {
    const rows = defaultPostmanHeaderRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe("Content-Type");
    expect(rows[0]?.value).toBe("application/json");
  });

  it("refreshTxDtHeader updates stale txDt", () => {
    const stale = [{ id: "1", key: "txDt", value: "19990101" }];
    const next = refreshTxDtHeader(stale);
    expect(next.find((r) => r.key === "txDt")?.value).toBe(fccTxDateToday());
  });

  it("ensureDefaultHeaders returns Content-Type when empty", () => {
    const rows = ensureDefaultHeaders(undefined);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe("Content-Type");
  });

  it("isPostmanPlaceholderValue detects {{var}} syntax", () => {
    expect(isPostmanPlaceholderValue("{{instCd}}")).toBe(true);
    expect(isPostmanPlaceholderValue("1001")).toBe(false);
  });

  it("migrateLegacyPostmanHeaders strips legacy FCC header rows", () => {
    const legacy = [
      { id: "1", key: "instCd", value: "{{instCd}}" },
      { id: "2", key: "deptId", value: "{{deptId}}" },
    ];
    const next = migrateLegacyPostmanHeaders(legacy);
    expect(next).toHaveLength(1);
    expect(next[0]?.key).toBe("Content-Type");
  });

  it("migrateLegacyPostmanHeaders keeps custom literals", () => {
    const custom = [
      { id: "1", key: "Content-Type", value: "application/json" },
      { id: "2", key: "X-Trace", value: "abc" },
    ];
    const next = migrateLegacyPostmanHeaders(custom);
    expect(next.find((r) => r.key === "X-Trace")?.value).toBe("abc");
  });
});

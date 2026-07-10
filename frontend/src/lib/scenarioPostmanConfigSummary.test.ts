import { describe, expect, it } from "vitest";
import { defaultPostmanHeaderRows } from "@/lib/scenarioPostmanHeaders";
import {
  headersMatchPlatformDefaults,
  postmanCollectionCardSummary,
} from "@/lib/scenarioPostmanConfigSummary";
import { emptyPostmanConfig } from "@/lib/scenarioPostmanVariables";

describe("scenarioPostmanConfigSummary", () => {
  it("detects platform default headers", () => {
    expect(headersMatchPlatformDefaults(emptyPostmanConfig())).toBe(true);
  });

  it("detects customized headers", () => {
    const cfg = emptyPostmanConfig();
    cfg.defaultHeaders = [
      ...defaultPostmanHeaderRows(),
      { id: "x", key: "X-Custom", value: "1" },
    ];
    expect(headersMatchPlatformDefaults(cfg)).toBe(false);
  });

  it("showEmptyCta when no baseUrl and only platform channel vars", () => {
    expect(postmanCollectionCardSummary(emptyPostmanConfig()).showEmptyCta).toBe(
      false,
    );
    const withUrl = { ...emptyPostmanConfig(), baseUrl: "https://api.test" };
    expect(postmanCollectionCardSummary(withUrl).showEmptyCta).toBe(false);
  });
});

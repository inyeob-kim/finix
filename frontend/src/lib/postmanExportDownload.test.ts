import { describe, expect, it } from "vitest";
import {
  defaultCollectionPostmanZipName,
  defaultSinglePostmanDownloadName,
  mergeExportPostmanConfig,
  pickInitialExportBaseUrl,
  resolvePostmanDownloadName,
} from "@/lib/postmanExportDownload";
import { emptyPostmanConfig } from "@/lib/scenarioPostmanVariables";
import type { ScenarioRegistryItem } from "@/app/components/scenarioRegistry/types";

describe("postmanExportDownload", () => {
  it("defaultSinglePostmanDownloadName sanitizes title", () => {
    expect(defaultSinglePostmanDownloadName("출금 시나리오")).toBe(
      "postman-출금-시나리오.json",
    );
  });

  it("resolvePostmanDownloadName uses default when empty", () => {
    expect(
      resolvePostmanDownloadName("", "postman-a.json", ".json"),
    ).toBe("postman-a.json");
    expect(resolvePostmanDownloadName(undefined, "postman-a.zip", ".zip")).toBe(
      "postman-a.zip",
    );
  });

  it("resolvePostmanDownloadName adds extension", () => {
    expect(resolvePostmanDownloadName("my-export", "postman-a.json", ".json")).toBe(
      "my-export.json",
    );
    expect(resolvePostmanDownloadName("bundle", "postman-a.zip", ".zip")).toBe(
      "bundle.zip",
    );
  });

  it("defaultCollectionPostmanZipName uses folder label", () => {
    expect(defaultCollectionPostmanZipName("FCC Core")).toBe("postman-FCC-Core.zip");
  });

  it("mergeExportPostmanConfig applies override only when set", () => {
    const saved = { ...emptyPostmanConfig(), baseUrl: "https://saved.test" };
    expect(mergeExportPostmanConfig(saved, "").baseUrl).toBe("https://saved.test");
    expect(mergeExportPostmanConfig(saved, "  https://override.test  ").baseUrl).toBe(
      "https://override.test",
    );
  });

  it("pickInitialExportBaseUrl reads first configured scenario", () => {
    const items = [
      { postmanConfig: emptyPostmanConfig() },
      { postmanConfig: { ...emptyPostmanConfig(), baseUrl: "https://api.test" } },
    ] as ScenarioRegistryItem[];
    expect(pickInitialExportBaseUrl(items)).toBe("https://api.test");
  });
});

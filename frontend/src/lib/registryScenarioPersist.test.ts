import { describe, expect, it, vi } from "vitest";
import { persistRegistryScenarioToDb } from "@/lib/registryScenarioPersist";
import * as scenarioApi from "@/api/scenarioApi";
import { emptyPostmanConfig } from "@/lib/scenarioPostmanVariables";

vi.mock("@/api/scenarioApi", () => ({
  createScenario: vi.fn().mockResolvedValue({ id: 42 }),
  saveScenarioDefinition: vi.fn().mockResolvedValue(undefined),
}));

describe("persistRegistryScenarioToDb", () => {
  it("always sends postman default_headers even without baseUrl or start_vars", async () => {
    await persistRegistryScenarioToDb({
      title: "테스트",
      serviceSequence: [{ code: "SVC1", name: "서비스1" }],
      postmanConfig: emptyPostmanConfig(),
    });

    const saveCall = vi.mocked(scenarioApi.saveScenarioDefinition).mock.calls[0];
    const payload = saveCall[1];
    expect(payload.postman).toBeDefined();
    expect(payload.postman!.default_headers.length).toBeGreaterThan(0);
    expect(payload.postman!.default_headers.some((h) => h.key === "instCd")).toBe(
      true,
    );
  });

  it("normalizes postman config before save", async () => {
    const legacy = {
      ...emptyPostmanConfig(),
      defaultHeaders: [{ key: "instCd", value: "{{instCd}}", enabled: true }],
    };
    await persistRegistryScenarioToDb({
      title: "레거시",
      serviceSequence: [{ code: "SVC1", name: "서비스1" }],
      postmanConfig: legacy,
    });

    const payload = vi.mocked(scenarioApi.saveScenarioDefinition).mock
      .calls[0][1];
    const instCd = payload.postman!.default_headers.find((h) => h.key === "instCd");
    expect(instCd?.value).toBe("1001");
  });
});

import { describe, expect, it, vi } from "vitest";
import { persistRegistryScenarioToDb } from "@/lib/registryScenarioPersist";
import * as scenarioApi from "@/api/scenarioApi";
import { emptyPostmanConfig } from "@/lib/scenarioPostmanVariables";

vi.mock("@/api/scenarioApi", () => ({
  createScenarioShell: vi.fn().mockResolvedValue({ id: 42 }),
  saveScenarioDefinition: vi.fn().mockResolvedValue(undefined),
}));

describe("persistRegistryScenarioToDb", () => {
  it("always sends postman header_vars with BXM channel defaults", async () => {
    await persistRegistryScenarioToDb({
      title: "테스트",
      serviceSequence: [{ code: "SVC1", name: "서비스1" }],
      postmanConfig: emptyPostmanConfig(),
    });

    expect(scenarioApi.createScenarioShell).toHaveBeenCalledWith({
      title: "테스트",
      prompt: "테스트",
      is_saved: true,
    });
    const saveCall = vi.mocked(scenarioApi.saveScenarioDefinition).mock.calls[0];
    const payload = saveCall[1];
    expect(payload.mark_saved).toBe(true);
    expect(payload.postman).toBeDefined();
    expect(payload.postman!.header_vars!.some((v) => v.key === "instCd")).toBe(
      true,
    );
    expect(payload.postman!.default_headers!.some((h) => h.key === "Content-Type")).toBe(
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
    const instCd = payload.postman!.header_vars!.find((v) => v.key === "instCd");
    expect(instCd?.value).toBe("1001");
  });

  it("draft saves create a shell with is_saved false", async () => {
    vi.mocked(scenarioApi.createScenarioShell).mockClear();
    vi.mocked(scenarioApi.saveScenarioDefinition).mockClear();

    await persistRegistryScenarioToDb({
      title: "초안",
      serviceSequence: [{ code: "SVC1", name: "서비스1" }],
      postmanConfig: emptyPostmanConfig(),
      markSaved: false,
    });

    expect(scenarioApi.createScenarioShell).toHaveBeenCalledWith({
      title: "초안",
      prompt: "초안",
      is_saved: false,
    });
    expect(
      vi.mocked(scenarioApi.saveScenarioDefinition).mock.calls[0][1].mark_saved,
    ).toBe(false);
  });

  it("reuses existingScenarioId without creating a shell", async () => {
    vi.mocked(scenarioApi.createScenarioShell).mockClear();
    vi.mocked(scenarioApi.saveScenarioDefinition).mockClear();

    const result = await persistRegistryScenarioToDb({
      title: "기존",
      serviceSequence: [{ code: "SVC1", name: "서비스1" }],
      postmanConfig: emptyPostmanConfig(),
      existingScenarioId: 99,
      markSaved: true,
    });

    expect(scenarioApi.createScenarioShell).not.toHaveBeenCalled();
    expect(result.scenarioId).toBe(99);
    expect(vi.mocked(scenarioApi.saveScenarioDefinition).mock.calls[0][0]).toBe(
      99,
    );
  });
});

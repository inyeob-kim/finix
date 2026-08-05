import { describe, expect, it } from "vitest";
import {
  assignPostmanImportFiles,
  classifyPostmanJson,
  MISSING_COLLECTION_MESSAGE,
  validatePostmanImportReady,
} from "./postmanImportClassify";

describe("postmanImportClassify", () => {
  it("classifies environment vs collection", () => {
    expect(
      classifyPostmanJson({
        values: [{ key: "a", value: "1" }],
        _postman_variable_scope: "environment",
      }),
    ).toBe("environment");
    expect(
      classifyPostmanJson({
        info: {
          schema:
            "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        item: [],
      }),
    ).toBe("collection");
  });

  it("accepts environment-only drop without error", () => {
    const assigned = assignPostmanImportFiles([
      {
        name: "env.json",
        payload: {
          values: [{ key: "a", value: "1" }],
          _postman_variable_scope: "environment",
        },
      },
    ]);
    expect(assigned.error).toBeNull();
    expect(assigned.environmentName).toBe("env.json");
    expect(assigned.collection).toBeNull();
  });

  it("validates collection at submit time", () => {
    expect(validatePostmanImportReady({ collection: null })).toBe(
      MISSING_COLLECTION_MESSAGE,
    );
    expect(validatePostmanImportReady({ collection: { item: [] } })).toBeNull();
  });

  it("pairs collection and environment", () => {
    const assigned = assignPostmanImportFiles([
      {
        name: "col.json",
        payload: { info: { schema: "…collection…" }, item: [] },
      },
      {
        name: "env.json",
        payload: {
          values: [{ key: "a", value: "1" }],
          _postman_variable_scope: "environment",
        },
      },
    ]);
    expect(assigned.error).toBeNull();
    expect(assigned.collectionName).toBe("col.json");
    expect(assigned.environmentName).toBe("env.json");
  });
});

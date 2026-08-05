/** Classify Postman JSON exports for import UI file slots. */

export type PostmanDocKind =
  | "collection"
  | "environment"
  | "request"
  | "unknown";

export function classifyPostmanJson(payload: unknown): PostmanDocKind {
  if (Array.isArray(payload)) return "collection";
  if (!payload || typeof payload !== "object") return "unknown";

  const doc = payload as Record<string, unknown>;
  const scope = String(doc._postman_variable_scope ?? "")
    .trim()
    .toLowerCase();
  if (scope === "environment") return "environment";

  const values = doc.values;
  const hasItem = Array.isArray(doc.item);
  const hasRequest =
    doc.request != null &&
    typeof doc.request === "object" &&
    !Array.isArray(doc.request);

  if (Array.isArray(values) && !hasItem && !hasRequest) {
    const hasKey = values.some(
      (row) =>
        row != null &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        "key" in (row as object),
    );
    if (hasKey) return "environment";
  }

  const info = doc.info;
  if (info && typeof info === "object" && !Array.isArray(info)) {
    const schema = String((info as { schema?: unknown }).schema ?? "");
    if (schema.toLowerCase().includes("collection")) return "collection";
  }

  if (hasItem) return "collection";
  if (hasRequest) return "request";
  return "unknown";
}

export type AssignedPostmanFiles = {
  collection: unknown | null;
  collectionName: string | null;
  environment: unknown | null;
  environmentName: string | null;
  error: string | null;
};

export const MISSING_COLLECTION_MESSAGE =
  "Collection 또는 Request JSON이 필요합니다. Environment만으로는 import할 수 없습니다.";

/**
 * Map one drop/select batch into collection / environment slots.
 * Does not require Collection yet — submit-time validation handles that.
 */
export function assignPostmanImportFiles(
  files: Array<{ name: string; payload: unknown }>,
): AssignedPostmanFiles {
  let collection: unknown | null = null;
  let collectionName: string | null = null;
  let environment: unknown | null = null;
  let environmentName: string | null = null;

  for (const file of files) {
    const kind = classifyPostmanJson(file.payload);
    if (kind === "environment") {
      if (environment != null) {
        return {
          collection,
          collectionName,
          environment,
          environmentName,
          error: "Environment 파일은 하나만 올릴 수 있습니다.",
        };
      }
      environment = file.payload;
      environmentName = file.name;
      continue;
    }
    if (kind === "collection" || kind === "request") {
      if (collection != null) {
        return {
          collection,
          collectionName,
          environment,
          environmentName,
          error: "Collection/Request 파일은 하나만 올릴 수 있습니다.",
        };
      }
      collection = file.payload;
      collectionName = file.name;
      continue;
    }
    return {
      collection: null,
      collectionName: null,
      environment: null,
      environmentName: null,
      error: `${file.name}: Postman Collection/Request/Environment JSON이 아닙니다.`,
    };
  }

  return {
    collection,
    collectionName,
    environment,
    environmentName,
    error: null,
  };
}

/** Submit guard: Collection/Request is required. */
export function validatePostmanImportReady(input: {
  collection: unknown | null;
}): string | null {
  if (input.collection == null) return MISSING_COLLECTION_MESSAGE;
  return null;
}

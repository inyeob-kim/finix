import { apiRequest } from "@/api/client";

const PREFIX = "/api/v1/collection-var-generators";

export type CollectionVarGeneratorDto = {
  key: string;
  label: string;
  description?: string;
  hint?: string;
  source: "builtin" | "shared";
  impl_kind?: string | null;
  impl?: Record<string, unknown>;
  prompt?: string | null;
};

export type CollectionVarGeneratorRecommendationDto = {
  key: string;
  label: string;
  source: "builtin" | "shared";
  reason?: string;
  sample_preview?: string;
};

export type CollectionVarGeneratorDraftDto = {
  key: string;
  label: string;
  description?: string;
  impl_kind: string;
  impl: Record<string, unknown>;
  sample_preview?: string;
  source: "llm" | "heuristic";
  recommendations?: CollectionVarGeneratorRecommendationDto[];
  has_draft?: boolean;
};

export async function listCollectionVarGenerators(): Promise<
  CollectionVarGeneratorDto[]
> {
  const res = await apiRequest<{ items: CollectionVarGeneratorDto[] }>(PREFIX);
  return res.items ?? [];
}

export async function draftCollectionVarGenerator(
  prompt: string,
): Promise<CollectionVarGeneratorDraftDto> {
  return apiRequest<CollectionVarGeneratorDraftDto>(`${PREFIX}/ai-draft`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export async function previewCollectionVarGenerator(body: {
  key?: string;
  impl_kind?: string;
  impl?: Record<string, unknown>;
}): Promise<{ value: string }> {
  return apiRequest<{ value: string }>(`${PREFIX}/preview`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createCollectionVarGenerator(body: {
  key: string;
  label: string;
  description?: string;
  prompt?: string;
  impl_kind: string;
  impl: Record<string, unknown>;
  created_by?: string;
}): Promise<CollectionVarGeneratorDto> {
  return apiRequest<CollectionVarGeneratorDto>(PREFIX, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteCollectionVarGenerator(key: string): Promise<void> {
  await apiRequest<void>(`${PREFIX}/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
}

export async function updateCollectionVarGenerator(
  key: string,
  body: {
    label?: string;
    description?: string;
    prompt?: string;
    impl_kind?: string;
    impl?: Record<string, unknown>;
  },
): Promise<CollectionVarGeneratorDto> {
  return apiRequest<CollectionVarGeneratorDto>(
    `${PREFIX}/${encodeURIComponent(key)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

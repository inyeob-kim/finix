import { apiRequest } from "./client";
import type { ServiceCatalogImportResultDto, ServiceCatalogItemReadDto } from "./types";

const CATALOG_PAGE_SIZE = 500;

export type ListServiceCatalogParams = {
  query?: string;
  limit?: number;
  offset?: number;
};

export async function listServiceCatalog(
  params?: ListServiceCatalogParams,
): Promise<ServiceCatalogItemReadDto[]> {
  const q = new URLSearchParams();
  q.set("limit", String(params?.limit ?? CATALOG_PAGE_SIZE));
  q.set("offset", String(params?.offset ?? 0));
  if (params?.query?.trim()) {
    q.set("query", params.query.trim());
  }
  return apiRequest<ServiceCatalogItemReadDto[]>(
    `/api/v1/service-catalog?${q.toString()}`,
    {
      method: "GET",
    },
  );
}

/** Fetch every catalog row (paginated requests until exhausted). */
export async function listAllServiceCatalog(
  params?: Pick<ListServiceCatalogParams, "query">,
): Promise<ServiceCatalogItemReadDto[]> {
  const all: ServiceCatalogItemReadDto[] = [];
  let offset = 0;

  for (;;) {
    const page = await listServiceCatalog({
      query: params?.query,
      limit: CATALOG_PAGE_SIZE,
      offset,
    });
    all.push(...page);
    if (page.length < CATALOG_PAGE_SIZE) {
      break;
    }
    offset += CATALOG_PAGE_SIZE;
  }

  return all;
}

export async function importServiceCatalogJson(
  payload: unknown,
): Promise<ServiceCatalogImportResultDto> {
  return apiRequest<ServiceCatalogImportResultDto>(
    "/api/v1/service-catalog/import-json",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function importServiceCatalogFromCbs(): Promise<ServiceCatalogImportResultDto> {
  return apiRequest<ServiceCatalogImportResultDto>(
    "/api/v1/service-catalog/import",
    { method: "POST" },
  );
}

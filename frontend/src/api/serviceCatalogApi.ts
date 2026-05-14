import { apiRequest } from "./client";
import type { ServiceCatalogItemReadDto } from "./types";

export async function listServiceCatalog(): Promise<ServiceCatalogItemReadDto[]> {
  const q = new URLSearchParams({ limit: "200", offset: "0" });
  return apiRequest<ServiceCatalogItemReadDto[]>(
    `/api/v1/service-catalog?${q.toString()}`,
    {
      method: "GET",
    },
  );
}

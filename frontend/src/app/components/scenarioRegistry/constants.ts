import type { ServiceCatalogItem } from "./types";

export const STORAGE_KEY_V2 = "finix.scenario.registry.v2";
export const STORAGE_KEY_V1 = "finix.scenario.registry.v1";

export const SERVICE_CATALOG: ServiceCatalogItem[] = [
  { code: "PY016", name: "Request bank salary payment" },
  { code: "AC011", name: "계좌해지" },
  { code: "CU018", name: "고객사망등록" },
  { code: "CM060", name: "정기예금 가입" },
  { code: "PY027", name: "수수료 결제 처리" },
];

export const SERVICE_ITEM_TYPE = "REGISTRY_SERVICE";


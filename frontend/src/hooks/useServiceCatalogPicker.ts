import { useEffect, useState } from "react";
import { listAllServiceCatalog } from "@/api/serviceCatalogApi";
import { ApiError } from "@/api/client";
import type { ServiceCatalogOption } from "@/lib/filterServiceCatalog";

/** Load full service catalog for ServiceCatalogCombobox (same as Rules/Meta YAML modal). */
export function useServiceCatalogPicker(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [catalog, setCatalog] = useState<ServiceCatalogOption[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await listAllServiceCatalog();
        if (cancelled) return;
        const mapped = rows
          .map((r) => ({
            code: (r.service_code || "").trim(),
            name: (r.service_name || "").trim() || r.service_code,
          }))
          .filter((r) => r.code);
        mapped.sort((a, b) => a.code.localeCompare(b.code));
        setCatalog(mapped);
      } catch (e) {
        if (!cancelled) {
          setCatalog([]);
          setError(
            e instanceof ApiError
              ? e.message
              : "서비스 목록을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { options: catalog, loading, error };
}

import { useEffect, useState } from "react";
import { listServiceRulesVersions } from "@/api/serviceRulesApi";
import { ApiError } from "@/api/client";
import type { ServiceRuleBundleReadDto } from "@/api/types";
import { FinixField, FinixUnderlineSelect } from "../ui/finix-form";

type Props = {
  serviceCode: string;
  bundleId: number;
  disabled?: boolean;
  onSelect: (bundleId: number) => void;
};

function versionLabel(v: ServiceRuleBundleReadDto): string {
  const st = (v.status || "draft").toLowerCase();
  return `v${v.version} · ${st} · #${v.id}`;
}

export function RulesMetaVersionSelect({
  serviceCode,
  bundleId,
  disabled,
  onSelect,
}: Props) {
  const [versions, setVersions] = useState<ServiceRuleBundleReadDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listServiceRulesVersions(serviceCode)
      .then((rows) => {
        if (!cancelled) {
          setVersions(rows);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setVersions([]);
          setError(
            e instanceof ApiError ? e.message : "버전 목록을 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceCode]);

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground">버전 목록 불러오는 중…</p>
    );
  }

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }

  if (versions.length <= 1) {
    return (
      <p className="text-xs text-muted-foreground font-mono">
        {versions[0] ? versionLabel(versions[0]) : `v— · #${bundleId}`}
      </p>
    );
  }

  return (
    <FinixField label="버전 이력" className="max-w-md">
      <FinixUnderlineSelect
        value={String(bundleId)}
        disabled={disabled}
        onChange={(e) => onSelect(Number(e.target.value))}
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {versionLabel(v)}
          </option>
        ))}
      </FinixUnderlineSelect>
    </FinixField>
  );
}

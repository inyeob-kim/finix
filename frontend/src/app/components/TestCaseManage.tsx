import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ExternalLink, ListChecks, Loader2, RefreshCw } from "lucide-react";
import { listTestCasesByServiceCode } from "@/api/testcaseApi";
import { listServiceCatalog } from "@/api/serviceCatalogApi";
import { ApiError } from "@/api/client";
import type { TestCaseReadDto } from "@/api/types";
import { PageShell } from "./PageShell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { FinixField, FinixUnderlineSelect } from "./ui/finix-form";
import { FinixPrimaryButton } from "./ui/finix-button";
import { SERVICE_CATALOG } from "./scenarioRegistry/constants";

export function TestCaseManage() {
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [services, setServices] = useState<
    { code: string; name: string }[]
  >([]);
  const [serviceCode, setServiceCode] = useState("");
  const [rows, setRows] = useState<TestCaseReadDto[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCatalogLoading(true);
      setError(null);
      try {
        const apiRows = await listServiceCatalog();
        if (cancelled) return;
        const mapped = apiRows
          .map((r) => ({
            code: (r.service_code || "").trim(),
            name: (r.service_name || "").trim() || r.service_code,
          }))
          .filter((r) => r.code);
        const catalog =
          mapped.length > 0
            ? mapped
            : SERVICE_CATALOG.map((s) => ({ code: s.code, name: s.name }));
        catalog.sort((a, b) => a.code.localeCompare(b.code));
        if (cancelled) return;
        setServices(catalog);
        setServiceCode((prev) =>
          prev && catalog.some((s) => s.code === prev)
            ? prev
            : catalog[0]?.code ?? "",
        );
      } catch (e) {
        if (!cancelled) {
          setServices(SERVICE_CATALOG);
          setServiceCode((prev) => prev || SERVICE_CATALOG[0]?.code || "");
          if (e instanceof ApiError && e.status !== 401) {
            setError("서비스 카탈로그를 불러오지 못해 로컬 목록을 사용합니다.");
          }
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadTestCases = useCallback(async () => {
    const code = serviceCode.trim();
    if (!code) {
      setRows([]);
      return;
    }
    setListLoading(true);
    setError(null);
    try {
      const data = await listTestCasesByServiceCode(code, 500);
      setRows(data);
    } catch (e) {
      setRows([]);
      setError(
        e instanceof ApiError ? e.message : "테스트 케이스를 불러오지 못했습니다.",
      );
    } finally {
      setListLoading(false);
    }
  }, [serviceCode]);

  useEffect(() => {
    if (!serviceCode || catalogLoading) return;
    void loadTestCases();
  }, [serviceCode, catalogLoading, loadTestCases]);

  const serviceLabel = useMemo(() => {
    const s = services.find((x) => x.code === serviceCode);
    return s ? `${s.code} — ${s.name}` : serviceCode;
  }, [services, serviceCode]);

  return (
    <PageShell
      icon={<ListChecks className="w-6 h-6 text-primary" />}
      title="테스트케이스 관리"
      description={
        <>
          YAML 규칙에서 생성되어 DB에 적재된 HTTP 테스트 케이스를{" "}
          <span className="font-medium text-foreground">서비스 코드</span>별로
          모아 봅니다.
        </>
      }
      actions={
        <FinixPrimaryButton
          type="button"
          className="gap-2"
          disabled={listLoading || !serviceCode}
          onClick={() => void loadTestCases()}
        >
          <RefreshCw
            className={`w-4 h-4 ${listLoading ? "animate-spin" : ""}`}
          />
          새로고침
        </FinixPrimaryButton>
      }
    >
      {error ? (
        <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-4 py-3">
          {error}
        </div>
      ) : null}

      <div className="rounded-sm border border-border bg-card p-4 md:p-5 space-y-4">
        <FinixField label="서비스" helperText="SRVC_CD 기준으로 적재된 테스트 케이스를 조회합니다.">
          {catalogLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              서비스 목록 불러오는 중…
            </div>
          ) : (
            <FinixUnderlineSelect
              value={serviceCode}
              onChange={(e) => setServiceCode(e.target.value)}
            >
              {services.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </option>
              ))}
            </FinixUnderlineSelect>
          )}
        </FinixField>

        <div className="text-xs text-muted-foreground">
          선택: {serviceLabel} · {rows.length}건
        </div>

        <div className="rounded-sm border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[72px]">ID</TableHead>
                <TableHead>이름</TableHead>
                <TableHead className="w-[100px]">시나리오</TableHead>
                <TableHead className="w-[88px]">메서드</TableHead>
                <TableHead>엔드포인트</TableHead>
                <TableHead className="w-[100px] text-right">이동</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2 align-middle" />
                    불러오는 중…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    이 서비스에 적재된 테스트 케이스가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell className="max-w-[320px]">
                      <span className="line-clamp-2 text-sm">{r.name}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.scenario_id != null ? `#${r.scenario_id}` : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.method ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[240px] truncate">
                      {r.endpoint ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.scenario_id != null ? (
                        <Link
                          to={`/test-case/${r.scenario_id}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          title="해당 시나리오의 테스트 케이스 화면으로 이동"
                        >
                          열기
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageShell>
  );
}

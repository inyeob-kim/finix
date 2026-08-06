import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Database, RefreshCw, Search } from "lucide-react";
import { ApiError } from "@/api/client";
import {
  getPoolCoverage,
  getPoolSample,
  listPoolSamples,
  promotePoolByService,
  promotePoolSample,
  type PathKind,
  type PoolSampleDto,
  type PoolServiceCoverageDto,
} from "@/api/dataPoolApi";
import { PAGE_SECTION_STACK_CLASS } from "@/lib/finixShellLayout";
import { PoolCoverageTable } from "./dataPool/PoolCoverageTable";
import { PoolSampleDetail } from "./dataPool/PoolSampleDetail";
import { LogIngestPanel } from "./logIngest/LogIngestPanel";
import { PageShell } from "./PageShell";
import { FinixUnderlineInput } from "./ui/finix-form";
import { FinixLoading } from "./ui/finix-loading";
import { cn } from "./ui/utils";

type MainTab = "samples" | "ingest";

function parseMainTab(raw: string | null): MainTab {
  return raw === "ingest" ? "ingest" : "samples";
}

export function DataPool() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mainTab = parseMainTab(searchParams.get("tab"));

  const setMainTab = useCallback(
    (tab: MainTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tab === "samples") next.delete("tab");
          else next.set("tab", tab);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [pathKind, setPathKind] = useState<PathKind | "">("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [items, setItems] = useState<PoolSampleDto[]>([]);
  const [happyTotal, setHappyTotal] = useState(0);
  const [negativeTotal, setNegativeTotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [coverage, setCoverage] = useState<PoolServiceCoverageDto[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PoolSampleDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, cov] = await Promise.all([
        listPoolSamples({
          path_kind: pathKind,
          query: query.trim() || undefined,
          source: source.trim() || undefined,
          limit: 100,
          offset: 0,
        }),
        getPoolCoverage(30),
      ]);
      setItems(res.items);
      setTotal(res.total);
      setHappyTotal(res.happy_total);
      setNegativeTotal(res.negative_total);
      setCoverage(cov.items);
      if (res.items.length && selectedId === null) {
        setSelectedId(res.items[0].id);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [pathKind, query, source, selectedId]);

  useEffect(() => {
    if (mainTab !== "samples") return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial + filter changes
  }, [pathKind, source, mainTab]);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await getPoolSample(selectedId);
        if (!cancelled) setDetail(row);
      } catch {
        if (!cancelled) setDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const onPromoteSelected = useCallback(async () => {
    if (selectedId == null) return;
    setPromoting(true);
    setPromoteMsg(null);
    setError(null);
    try {
      const res = await promotePoolSample(selectedId, false);
      const ref = `${res.svc_code}/${res.rule_case_id}`;
      setPromoteMsg(
        res.reused
          ? `이미 승격된 TC ${ref} · ${res.name}`
          : `TC 승격 완료 ${ref} · ${res.name}`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "승격에 실패했습니다.");
    } finally {
      setPromoting(false);
    }
  }, [selectedId]);

  const onPromoteService = useCallback(async () => {
    const code = detail?.service_code?.trim();
    if (!code) {
      setError("선택한 샘플에 service_code가 없습니다.");
      return;
    }
    setPromoting(true);
    setPromoteMsg(null);
    setError(null);
    try {
      const res = await promotePoolByService({ service_code: code });
      setPromoteMsg(`${code} Pool → TC ${res.count}건 승격 완료`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "일괄 승격에 실패했습니다.");
    } finally {
      setPromoting(false);
    }
  }, [detail]);

  const onIngestCommitted = useCallback(() => {
    setMainTab("samples");
    void load();
  }, [load, setMainTab]);

  return (
    <PageShell
      icon={<Database className="w-5 h-5" strokeWidth={2} />}
      title="데이터 풀"
      actions={
        mainTab === "samples" ? (
          <button
            type="button"
            className="h-9 w-9 inline-flex items-center justify-center rounded-sm border border-border hover:bg-muted"
            aria-label="새로고침"
            onClick={() => void load()}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        ) : null
      }
    >
      <div className={PAGE_SECTION_STACK_CLASS}>
        <div className="flex gap-1 border-b border-border shrink-0">
          {(
            [
              { id: "samples" as const, label: "샘플 목록" },
              { id: "ingest" as const, label: "로그 적재" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                "px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors",
                mainTab === t.id
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setMainTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mainTab === "ingest" ? (
          <LogIngestPanel onCommitted={onIngestCommitted} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground shrink-0">
              <span>
                전체 <strong className="text-foreground">{total}</strong>
              </span>
              <span>
                Happy <strong className="text-foreground">{happyTotal}</strong>
              </span>
              <span>
                Negative{" "}
                <strong className="text-foreground">{negativeTotal}</strong>
              </span>
              {coverage.length > 0 ? (
                <span className="text-muted-foreground">
                  · 서비스 {coverage.length}개
                </span>
              ) : null}
            </div>

            <PoolCoverageTable items={coverage} />

            <div className="flex flex-wrap gap-2 items-end shrink-0">
              <div className="flex gap-1 rounded-sm border border-border p-0.5">
                {(
                  [
                    { id: "" as const, label: "전체" },
                    { id: "happy" as const, label: "Happy" },
                    { id: "negative" as const, label: "Negative" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id || "all"}
                    type="button"
                    className={cn(
                      "h-8 px-3 text-xs rounded-sm",
                      pathKind === t.id
                        ? "bg-primary/15 text-foreground"
                        : "text-muted-foreground",
                    )}
                    onClick={() => setPathKind(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[12rem]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <FinixUnderlineInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void load();
                  }}
                  placeholder="서비스·endpoint·에러코드 검색"
                  className="pl-7"
                />
              </div>
              <FinixUnderlineInput
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="source (paste|server_bulk|…)"
                className="w-40"
              />
              <button
                type="button"
                className="h-9 px-3 rounded-sm border border-border text-sm hover:bg-muted"
                onClick={() => void load()}
              >
                검색
              </button>
            </div>

            {error ? (
              <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-3 py-2">
                {error}
              </div>
            ) : null}
            {promoteMsg ? (
              <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-sm px-3 py-2">
                {promoteMsg}
              </div>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-0 flex-1">
              <div className="lg:col-span-3 rounded-md border border-border overflow-auto min-h-[240px]">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <FinixLoading label="불러오는 중…" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-muted-foreground space-y-3">
                    <p>Data Pool이 비어 있습니다.</p>
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={() => setMainTab("ingest")}
                    >
                      로그 적재로 샘플 넣기
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2">Kind</th>
                        <th className="px-3 py-2">API</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Error</th>
                        <th className="px-3 py-2">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row) => (
                        <tr
                          key={row.id}
                          className={cn(
                            "border-t border-border cursor-pointer hover:bg-muted/40",
                            selectedId === row.id && "bg-primary/10",
                          )}
                          onClick={() => setSelectedId(row.id)}
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {row.path_kind}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            <span className="text-muted-foreground">
                              {row.method}
                            </span>{" "}
                            {row.service_code ?? "—"}{" "}
                            <span className="text-muted-foreground truncate inline-block max-w-[10rem] align-bottom">
                              {row.endpoint}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {row.http_status ?? "—"}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {row.biz_error_code ?? "—"}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {row.source}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="lg:col-span-2 rounded-md border border-border p-4 space-y-3 overflow-auto min-h-[240px]">
                <PoolSampleDetail
                  detail={detail}
                  promoting={promoting}
                  onPromoteSelected={() => void onPromoteSelected()}
                  onPromoteService={() => void onPromoteService()}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
